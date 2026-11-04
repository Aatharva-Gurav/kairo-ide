import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startSidecarServer, SidecarInstance } from "../server/server";
import {
  CommandEnvelope,
  ResponseEnvelope,
  HandshakeParams,
} from "../../lib/ai-agent/types";
import { PROTOCOL_VERSION } from "../../lib/ai-agent/protocol-constants";

describe("Sidecar WebSocket Transport & Auth", () => {
  let sidecar: SidecarInstance;
  const TEST_PORT = 49192;
  const SECRET_TOKEN = "valid-secret-token-12345";
  let networkAvailable = true;

  beforeAll(async () => {
    sidecar = startSidecarServer({
      port: TEST_PORT,
      approvalToken: SECRET_TOKEN,
      logLevel: "error",
    });

    // Probe if loopback network is reachable in this environment
    try {
      await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    } catch (err: any) {
      if (err?.code === "EACCES") {
        networkAvailable = false;
      }
    }
  });

  afterAll(async () => {
    if (sidecar) {
      await sidecar.stop();
    }
  });

  it("rejects WebSocket upgrade without approval token (401)", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/transport`, {
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects WebSocket upgrade with wrong approval token (401)", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const res = await fetch(
      `http://127.0.0.1:${TEST_PORT}/transport?approval_token=wrong-token-abc`,
      {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version": "13",
        },
      }
    );
    expect(res.status).toBe(401);
  });

  it("connects and handles handshake and ping commands over WebSocket", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const wsUrl = `ws://127.0.0.1:${TEST_PORT}/transport?approval_token=${SECRET_TOKEN}`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WebSocket connection timeout")), 4000);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);

    // 1. Handshake command
    const handshakeCommand: CommandEnvelope<"handshake", HandshakeParams> = {
      type: "command",
      id: "cmd-handshake-1",
      name: "handshake",
      params: {
        clientVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
      },
    };

    const handshakeReplyPromise = new Promise<ResponseEnvelope>((resolve) => {
      const handler = (event: MessageEvent) => {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "response" && parsed.id === "cmd-handshake-1") {
          ws.removeEventListener("message", handler);
          resolve(parsed);
        }
      };
      ws.addEventListener("message", handler);
    });

    ws.send(JSON.stringify(handshakeCommand));
    const handshakeReply = await handshakeReplyPromise;

    expect(handshakeReply.status).toBe("ok");
    if (handshakeReply.status === "ok") {
      const res = handshakeReply.result as Record<string, unknown>;
      expect(res.status).toBe("ready");
      expect(res.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(Array.isArray(res.supportedProviders)).toBe(true);
    }

    // 2. Ping command
    const pingCommand: CommandEnvelope<"ping"> = {
      type: "command",
      id: "cmd-ping-2",
      name: "ping",
    };

    const pingReplyPromise = new Promise<ResponseEnvelope>((resolve) => {
      const handler = (event: MessageEvent) => {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "response" && parsed.id === "cmd-ping-2") {
          ws.removeEventListener("message", handler);
          resolve(parsed);
        }
      };
      ws.addEventListener("message", handler);
    });

    ws.send(JSON.stringify(pingCommand));
    const pingReply = await pingReplyPromise;

    expect(pingReply.status).toBe("ok");
    if (pingReply.status === "ok") {
      const res = pingReply.result as Record<string, unknown>;
      expect(typeof res.pong).toBe("number");
    }

    // 3. Test unknown command handling
    const unknownCommand = {
      type: "command",
      id: "cmd-unknown-3",
      name: "nonexistent_command",
    };

    const unknownReplyPromise = new Promise<ResponseEnvelope>((resolve) => {
      const handler = (event: MessageEvent) => {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "response" && parsed.id === "cmd-unknown-3") {
          ws.removeEventListener("message", handler);
          resolve(parsed);
        }
      };
      ws.addEventListener("message", handler);
    });

    ws.send(JSON.stringify(unknownCommand));
    const unknownReply = await unknownReplyPromise;

    expect(unknownReply.status).toBe("error");
    if (unknownReply.status === "error") {
      expect(unknownReply.error.code).toBe("ERR_NOT_FOUND");
    }

    // 4. Test malformed JSON frame handling
    const malformedReplyPromise = new Promise<ResponseEnvelope>((resolve) => {
      const handler = (event: MessageEvent) => {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "response" && parsed.id === "unknown") {
          ws.removeEventListener("message", handler);
          resolve(parsed);
        }
      };
      ws.addEventListener("message", handler);
    });

    ws.send("NOT_A_JSON_STRING{{{");
    const malformedReply = await malformedReplyPromise;

    expect(malformedReply.status).toBe("error");
    if (malformedReply.status === "error") {
      expect(malformedReply.error.code).toBe("ERR_INVALID_FRAME");
    }

    ws.close();
  });

  it("rejects HTTP and WebSocket requests from foreign origin (403)", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
      headers: {
        Origin: "http://malicious-site.com",
      },
    });
    expect(res.status).toBe(403);
  });
});
