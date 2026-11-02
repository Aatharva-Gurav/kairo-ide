import { describe, it, expect } from "bun:test";
import { EventAdapter } from "../runtime/event-adapter";
import { EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import type { CoreSessionEvent } from "@cline/core";

describe("EventAdapter", () => {
  it("transforms text chunks into token_delta events", () => {
    const adapter = new EventAdapter();
    const event: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "content_start",
          contentType: "text",
          text: "Hello world",
        },
      },
    };

    const envelope = adapter.transform(event);
    expect(envelope).not.toBeNull();
    expect(envelope!.event).toBe(EVENT_NAMES.TOKEN_DELTA);
    expect(envelope!.sessionId).toBe("sess-1");
    expect((envelope!.payload as any).delta).toBe("Hello world");
  });

  it("STRICTLY REDACTS reasoning / chain-of-thought events", () => {
    const adapter = new EventAdapter();
    const privateSecretThought = "Thinking: I must look at user secret API keys in .env";

    const reasoningEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "content_start",
          contentType: "reasoning",
          reasoning: privateSecretThought,
        },
      },
    };

    const envelope = adapter.transform(reasoningEvent);
    expect(envelope).not.toBeNull();
    expect(envelope!.event).toBe(EVENT_NAMES.SESSION_STATUS);
    expect((envelope!.payload as any).status).toBe("thinking");
    // Verify private reasoning string was NOT included in payload
    const jsonString = JSON.stringify(envelope);
    expect(jsonString).not.toContain(privateSecretThought);
  });

  it("maps tool started, progress, completed, and failed events", () => {
    const adapter = new EventAdapter();

    // Tool Started
    const startEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "content_start",
          contentType: "tool",
          toolCallId: "call-1",
          toolName: "read_file",
          input: { path: "src/index.ts" },
        },
      },
    };
    const startEnvelope = adapter.transform(startEvent);
    expect(startEnvelope!.event).toBe(EVENT_NAMES.TOOL_STARTED);
    expect((startEnvelope!.payload as any).toolName).toBe("read_file");

    // Tool Completed
    const endEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "content_end",
          contentType: "tool",
          toolCallId: "call-1",
          toolName: "read_file",
          output: "file contents",
          durationMs: 42,
        },
      },
    };
    const endEnvelope = adapter.transform(endEvent);
    expect(endEnvelope!.event).toBe(EVENT_NAMES.TOOL_COMPLETED);
    expect((endEnvelope!.payload as any).durationMs).toBe(42);

    // Tool Failed
    const failEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "content_end",
          contentType: "tool",
          toolCallId: "call-2",
          toolName: "write_file",
          error: "Permission denied",
          durationMs: 15,
        },
      },
    };
    const failEnvelope = adapter.transform(failEvent);
    expect(failEnvelope!.event).toBe(EVENT_NAMES.TOOL_FAILED);
    expect((failEnvelope!.payload as any).error).toBe("Permission denied");
  });

  it("maps usage metrics accurately", () => {
    const adapter = new EventAdapter();
    const usageEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "usage",
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.0015,
          totalInputTokens: 200,
          totalOutputTokens: 100,
          totalCost: 0.003,
        },
      },
    };

    const envelope = adapter.transform(usageEvent);
    expect(envelope!.event).toBe(EVENT_NAMES.USAGE_UPDATE);
    const payload = envelope!.payload as any;
    expect(payload.inputTokens).toBe(100);
    expect(payload.outputTokens).toBe(50);
    expect(payload.totalCost).toBe(0.003);
  });

  it("sanitizes agent errors and redacts credentials", () => {
    const adapter = new EventAdapter();
    const errorEvent: CoreSessionEvent = {
      type: "agent_event",
      payload: {
        sessionId: "sess-1",
        event: {
          type: "error",
          error: new Error("401 Unauthorized with key sk-ant-api03-abcdef1234567890123456789012"),
          recoverable: false,
          iteration: 1,
        },
      },
    };

    const envelope = adapter.transform(errorEvent);
    expect(envelope!.event).toBe(EVENT_NAMES.AGENT_ERROR);
    const json = JSON.stringify(envelope);
    expect(json).not.toContain("sk-ant-api03-abcdef1234567890123456789012");
  });
});
