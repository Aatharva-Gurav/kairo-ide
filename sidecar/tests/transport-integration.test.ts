import { describe, it, expect } from "bun:test";
import { startSidecarServer } from "../server/server";
import { Logger } from "../utils/logger";
import { EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import type {
  ResponseEnvelope,
  EventEnvelope,
  HandshakeResult,
  StartTaskResult,
} from "../../lib/ai-agent/types";

// Mock streaming fetch providing SSE chunks to Cline SDK
const mockStreamingFetch = (async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"id":"chatcmpl-100","choices":[{"index":0,"delta":{"role":"assistant","content":"Kairo "},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-100","choices":[{"index":0,"delta":{"content":"Desktop Agent online!"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-100","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}) as unknown as typeof fetch;

describe("Transport Integration with Real Cline SDK", () => {
  const logger = new Logger("test-transport-e2e");

  it("completes handshake, starts task, and streams response over WebSocket", async () => {
    const approvalToken = "csprng-test-secret-token-123456789";

    const serverInstance = startSidecarServer(
      {
        port: 0,
        approvalToken,
        logLevel: "error",
        fetchImpl: mockStreamingFetch,
      },
      logger
    );

    const actualPort = serverInstance.port;
    expect(actualPort).toBeGreaterThan(0);

    const wsUrl = `ws://127.0.0.1:${actualPort}/transport?approval_token=${approvalToken}`;
    const ws = new WebSocket(wsUrl);

    const incomingResponses = new Map<string, ResponseEnvelope>();
    const incomingEvents: EventEnvelope[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(err);
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.type === "response") {
        incomingResponses.set(msg.id, msg);
      } else if (msg.type === "event") {
        incomingEvents.push(msg);
      }
    };

    // 1. Handshake
    const handshakeCmd = {
      type: "command",
      id: "cmd-handshake",
      name: "handshake",
      params: {
        clientVersion: "1.0.0",
        protocolVersion: "1.0.0",
      },
    };
    ws.send(JSON.stringify(handshakeCmd));

    await new Promise((r) => setTimeout(r, 100));
    const handshakeRes = incomingResponses.get("cmd-handshake");
    expect(handshakeRes).toBeDefined();
    expect(handshakeRes!.status).toBe("ok");
    const hsResult = (handshakeRes as any).result as HandshakeResult;
    expect(hsResult.status).toBe("ready");

    // 2. Start Task with real Cline SDK session
    const startCmd = {
      type: "command",
      id: "cmd-start",
      name: "start_task",
      params: {
        prompt: "Hello Kairo",
        providerId: "openai-compatible",
        modelId: "mock-model",
        apiKey: "mock-key",
        baseUrl: "http://127.0.0.1:9999/v1",
        workspacePath: process.cwd(),
      },
    };
    ws.send(JSON.stringify(startCmd));

    // Wait for response and streaming events to arrive
    await new Promise((r) => setTimeout(r, 1200));

    const startRes = incomingResponses.get("cmd-start");
    expect(startRes).toBeDefined();
    expect(startRes!.status).toBe("ok");
    const startData = (startRes as any).result as StartTaskResult;
    expect(startData.sessionId).toBeTruthy();

    // Verify token_delta events arrived over the WebSocket wire
    const deltas = incomingEvents.filter((e) => e.event === EVENT_NAMES.TOKEN_DELTA);
    expect(deltas.length).toBeGreaterThanOrEqual(1);

    const concatenated = deltas.map((e) => (e.payload as any).delta).join("");
    expect(concatenated).toContain("Kairo ");

    // 3. Cancel task
    const cancelCmd = {
      type: "command",
      id: "cmd-cancel",
      name: "cancel_task",
      params: {
        sessionId: startData.sessionId,
      },
    };
    ws.send(JSON.stringify(cancelCmd));

    await new Promise((r) => setTimeout(r, 100));
    const cancelRes = incomingResponses.get("cmd-cancel");
    expect(cancelRes).toBeDefined();
    expect(cancelRes!.status).toBe("ok");

    // Clean teardown
    ws.close();
    await serverInstance.stop();
  });
});
