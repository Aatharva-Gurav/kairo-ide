import { describe, it, expect, afterEach } from "bun:test";
import { RuntimeManager } from "../runtime/manager";
import { EventAdapter } from "../runtime/event-adapter";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { SessionService } from "../sessions";
import { Logger } from "../utils/logger";
import { EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import type { EventEnvelope } from "../../lib/ai-agent/types";

// Mock streaming fetch that simulates an OpenAI-compatible / Anthropic SSE stream
const mockStreamingFetch = (async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello "},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"from Kairo AI agent!"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
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

describe("SessionService with Cline SDK", () => {
  const logger = new Logger("test-session-svc");
  let manager: RuntimeManager | null = null;
  let service: SessionService | null = null;

  afterEach(async () => {
    if (service) {
      service.dispose();
      service = null;
    }
    if (manager) {
      await manager.dispose();
      manager = null;
    }
  });

  it("creates a real session and streams response tokens", async () => {
    const coordinator = new ApprovalCoordinator(logger);
    const adapter = new EventAdapter();
    manager = new RuntimeManager(logger, {
      clientName: "kairo-ide-test",
      approvalCoordinator: coordinator,
      fetchImpl: mockStreamingFetch,
    });
    service = new SessionService(logger, manager, adapter, coordinator);

    const receivedEvents: EventEnvelope[] = [];
    service.registerBroadcaster((event) => {
      receivedEvents.push(event);
    });

    const sessionId = await service.createSession({
      prompt: "Hello assistant",
      providerId: "openai-compatible",
      modelId: "test-model",
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:9999/v1",
      workspacePath: process.cwd(),
    });

    expect(sessionId).toBeTruthy();
    expect(service.getActiveCount()).toBe(1);

    // Wait for the turn to drain through mock SSE
    await new Promise((r) => setTimeout(r, 600));

    // Verify received events contain token deltas
    const tokenDeltas = receivedEvents.filter((e) => e.event === EVENT_NAMES.TOKEN_DELTA);
    expect(tokenDeltas.length).toBeGreaterThanOrEqual(1);

    const streamedWords = tokenDeltas.map((e) => (e.payload as any).delta).join("");
    expect(streamedWords).toContain("Hello ");

    // Verify session history listing
    const sessions = await service.listSessions(10);
    expect(Array.isArray(sessions)).toBe(true);
    const found = sessions.find((s) => s.sessionId === sessionId);
    expect(found).toBeDefined();

    // Verify session abort
    await service.abortSession(sessionId, "Test cleanup");

    // Verify session deletion
    const deleted = await service.deleteSession(sessionId);
    expect(deleted).toBe(true);
  });
});
