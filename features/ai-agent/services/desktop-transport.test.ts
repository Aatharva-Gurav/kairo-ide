import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DesktopTransport } from "./desktop-transport";
import {
  CommandEnvelope,
  ResponseEnvelope,
} from "../../../lib/ai-agent/types";
import { PROTOCOL_VERSION } from "../../../lib/ai-agent/protocol-constants";

// Mock WebSocket
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];
  public readyState = 1; // WebSocket.OPEN
  public url: string;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;
  public sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data: string) {
    this.sentMessages.push(data);
    const parsed = JSON.parse(data) as CommandEnvelope;

    // Auto-respond to handshake
    if (parsed.name === "handshake") {
      setTimeout(() => {
        if (this.onmessage) {
          const res: ResponseEnvelope = {
            type: "response",
            id: parsed.id,
            status: "ok",
            result: {
              status: "ready",
              serverVersion: "0.1.0",
              protocolVersion: PROTOCOL_VERSION,
              supportedProviders: ["anthropic"],
            },
          };
          this.onmessage({ data: JSON.stringify(res) });
        }
      }, 5);
    }
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}

describe("DesktopTransport Client", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
  });

  it("connects and completes handshake with mocked endpoint", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
    });

    const states: string[] = [];
    transport.onStateChange((s) => states.push(s));

    await transport.connect();

    // Wait for handshake
    await new Promise((r) => setTimeout(r, 50));

    expect(transport.getState()).toBe("connected");
    expect(states).toContain("connecting");
    expect(states).toContain("authenticating");
    expect(states).toContain("connected");

    transport.disconnect();
    expect(transport.getState()).toBe("disconnected");
  });

  it("sends commands and correlates responses by request ID", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
    });

    await transport.connect();
    await new Promise((r) => setTimeout(r, 50));

    const ws = MockWebSocket.instances[0];

    // Mock response to custom command
    const commandPromise = transport.sendCommand<{ message: string }>("custom_action", {
      foo: "bar",
    });

    // Check that command was sent
    await new Promise((r) => setTimeout(r, 10));
    const sent = ws.sentMessages.map((m) => JSON.parse(m));
    const actionCmd = sent.find((c) => c.name === "custom_action");
    expect(actionCmd).toBeDefined();

    // Emit response
    ws.onmessage?.({
      data: JSON.stringify({
        type: "response",
        id: actionCmd.id,
        status: "ok",
        result: { message: "Action succeeded" },
      }),
    });

    const result = await commandPromise;
    expect(result.message).toBe("Action succeeded");

    transport.disconnect();
  });

  it("rejects command when response has status error", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
    });

    await transport.connect();
    await new Promise((r) => setTimeout(r, 50));

    const ws = MockWebSocket.instances[0];

    const commandPromise = transport.sendCommand("failing_action");

    await new Promise((r) => setTimeout(r, 10));
    const sent = ws.sentMessages.map((m) => JSON.parse(m));
    const failCmd = sent.find((c) => c.name === "failing_action");

    ws.onmessage?.({
      data: JSON.stringify({
        type: "response",
        id: failCmd.id,
        status: "error",
        error: {
          code: "ERR_UNAUTHORIZED",
          message: "Operation denied",
        },
      }),
    });

    await expect(commandPromise).rejects.toThrow("Operation denied");

    transport.disconnect();
  });

  it("times out if server does not respond within deadline", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
    });

    await transport.connect();
    await new Promise((r) => setTimeout(r, 50));

    // Send command with short 50ms timeout
    const commandPromise = transport.sendCommand("silent_action", {}, 50);

    await expect(commandPromise).rejects.toThrow(/RPC timeout/);

    transport.disconnect();
  });

  it("deduplicates events by session sequence number", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
    });

    await transport.connect();
    await new Promise((r) => setTimeout(r, 50));

    const ws = MockWebSocket.instances[0];
    const receivedEvents: Array<{ text: string }> = [];

    transport.on<{ text: string }>("token_delta", (payload) => {
      receivedEvents.push(payload);
    });

    // Send event seq 0
    ws.onmessage?.({
      data: JSON.stringify({
        type: "event",
        event: "token_delta",
        sessionId: "session-1",
        seq: 0,
        timestamp: Date.now(),
        payload: { text: "Hello" },
      }),
    });

    // Send event seq 0 duplicate -> should be ignored!
    ws.onmessage?.({
      data: JSON.stringify({
        type: "event",
        event: "token_delta",
        sessionId: "session-1",
        seq: 0,
        timestamp: Date.now(),
        payload: { text: "Duplicate Hello" },
      }),
    });

    // Send event seq 1 -> should be processed!
    ws.onmessage?.({
      data: JSON.stringify({
        type: "event",
        event: "token_delta",
        sessionId: "session-1",
        seq: 1,
        timestamp: Date.now(),
        payload: { text: " World" },
      }),
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0].text).toBe("Hello");
    expect(receivedEvents[1].text).toBe(" World");

    transport.disconnect();
  });

  it("blocks sending payloads that exceed maxPayloadBytes", async () => {
    const mockEndpoint = {
      httpUrl: "http://127.0.0.1:49152",
      wsUrl: "ws://127.0.0.1:49152/transport",
      port: 49152,
      token: "mock-secret-token",
      pid: 1234,
    };

    const transport = new DesktopTransport({
      getEndpoint: async () => mockEndpoint,
      maxPayloadBytes: 1000, // Small limit for test
    });

    await transport.connect();
    await new Promise((r) => setTimeout(r, 50));

    const hugeData = "A".repeat(2000);
    await expect(transport.sendCommand("test", { hugeData })).rejects.toThrow(
      /exceeds maximum permitted size/
    );

    transport.disconnect();
  });
});
