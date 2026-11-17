import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionHistoryService } from "./session-history.service";
import { DesktopTransport } from "./desktop-transport";
import { COMMAND_NAMES, EVENT_NAMES } from "../../../lib/ai-agent/protocol-constants";
import type { EventEnvelope } from "../../../lib/ai-agent/types";

describe("SessionHistoryService", () => {
  let mockTransport: {
    sendCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  let service: SessionHistoryService;
  let eventHandlers: Map<string, (payload: unknown, envelope: EventEnvelope) => void>;

  beforeEach(() => {
    eventHandlers = new Map();
    mockTransport = {
      sendCommand: vi.fn(),
      on: vi.fn((event: string, handler: (payload: unknown, envelope: EventEnvelope) => void) => {
        eventHandlers.set(event, handler);
        return () => {
          eventHandlers.delete(event);
        };
      }),
    };

    service = new SessionHistoryService(mockTransport as unknown as DesktopTransport);
  });

  it("subscribes to session events on initialization", () => {
    expect(mockTransport.on).toHaveBeenCalledWith(
      EVENT_NAMES.SESSION_RESTORED,
      expect.any(Function)
    );
    expect(mockTransport.on).toHaveBeenCalledWith(
      EVENT_NAMES.SESSION_RENAMED,
      expect.any(Function)
    );
    expect(mockTransport.on).toHaveBeenCalledWith(
      EVENT_NAMES.SESSION_INTERRUPTED,
      expect.any(Function)
    );
  });

  it("lists sessions and enriches them with Kairo metadata", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "sess-123",
          createdAt: 1000,
          updatedAt: 2000,
          messageCount: 5,
          metadata: {
            title: "Build auth feature",
            workspacePath: "/projects/app",
            taskState: "completed",
            mode: "act",
            isInterrupted: false,
            hasPlan: true,
          },
        },
      ],
    });

    const listener = vi.fn();
    service.onSessionsChange(listener);

    const sessions = await service.listSessions(10);
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.LIST_SESSIONS, {
      limit: 10,
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      sessionId: "sess-123",
      title: "Build auth feature",
      createdAt: 1000,
      updatedAt: 2000,
      workspacePath: "/projects/app",
      taskState: "completed",
      mode: "act",
      isInterrupted: false,
      hasPlan: true,
      messageCount: 5,
    });
    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sessionId: "sess-123" })]));
  });

  it("loads a specific session transcript and usage", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      session: {
        sessionId: "sess-123",
        messages: [{ role: "user", content: "hello" }],
        usage: { totalCost: 0.05 },
      },
    });

    const result = await service.loadSession("sess-123");
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.LOAD_SESSION, {
      sessionId: "sess-123",
    });
    expect(result?.sessionId).toBe("sess-123");
    expect(service.getActiveSessionId()).toBe("sess-123");
  });

  it("restores a session and updates active status and cache", async () => {
    // Populate cache first
    mockTransport.sendCommand.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "sess-restore",
          metadata: { title: "Old Title", taskState: "interrupted" },
        },
      ],
    });
    await service.listSessions();

    mockTransport.sendCommand.mockResolvedValueOnce({
      sessionId: "sess-restore",
      restored: true,
      metadata: {
        conversationId: "sess-restore",
        clineSessionId: "sess-restore",
        taskId: "sess-restore",
        workspaceId: "default",
        workspacePath: "/workspace",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Restored Work",
        createdAt: 1000,
        updatedAt: 3000,
        lastActivityAt: 3000,
        status: "idle",
        taskState: "idle",
        mode: "plan",
        tags: [],
      },
      messages: [],
    });

    const res = await service.restoreSession("sess-restore", "/workspace");
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.RESTORE_SESSION, {
      sessionId: "sess-restore",
      workspacePath: "/workspace",
    });
    expect(res.restored).toBe(true);
    expect(service.getActiveSessionId()).toBe("sess-restore");

    const cached = service.getCachedSessions().find((s) => s.sessionId === "sess-restore");
    expect(cached?.title).toBe("Restored Work");
    expect(cached?.taskState).toBe("idle");
    expect(cached?.mode).toBe("plan");
  });

  it("renames a session and updates local cache", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      sessions: [{ sessionId: "sess-rename", metadata: { title: "Old Title" } }],
    });
    await service.listSessions();

    mockTransport.sendCommand.mockResolvedValueOnce({
      sessionId: "sess-rename",
      title: "New Brilliant Title",
    });

    const res = await service.renameSession("sess-rename", "New Brilliant Title");
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.RENAME_SESSION, {
      sessionId: "sess-rename",
      title: "New Brilliant Title",
    });
    expect(res.title).toBe("New Brilliant Title");

    const cached = service.getCachedSessions().find((s) => s.sessionId === "sess-rename");
    expect(cached?.title).toBe("New Brilliant Title");
  });

  it("deletes a session and clears activeSessionId if it matches", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      sessions: [{ sessionId: "sess-del", metadata: { title: "To Delete" } }],
    });
    await service.listSessions();
    service.setActiveSessionId("sess-del");

    mockTransport.sendCommand.mockResolvedValueOnce({ deleted: true });

    const deleted = await service.deleteSession("sess-del");
    expect(deleted).toBe(true);
    expect(service.getActiveSessionId()).toBeNull();
    expect(service.getCachedSessions()).toHaveLength(0);
  });

  it("searches sessions by query", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      results: [
        {
          sessionId: "sess-found",
          title: "Refactor database",
          workspacePath: "/app",
          snippet: "matched snippet",
          lastActivityAt: 5000,
        },
      ],
    });

    const results = await service.searchSessions("database", 5);
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.SEARCH_SESSIONS, {
      query: "database",
      limit: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("sess-found");
  });

  it("reconciles startup state", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      reconciledCount: 2,
      interruptedSessionIds: ["s1", "s2"],
    });

    const result = await service.reconcileStartupState();
    expect(mockTransport.sendCommand).toHaveBeenCalledWith(COMMAND_NAMES.RECONCILE_SESSIONS, {
      dryRun: undefined,
    });
    expect(result.reconciledCount).toBe(2);
  });

  it("handles incoming server events to update state reactively", async () => {
    mockTransport.sendCommand.mockResolvedValueOnce({
      sessions: [{ sessionId: "sess-live", metadata: { title: "Live Session", taskState: "idle" } }],
    });
    await service.listSessions();

    const handler = eventHandlers.get(EVENT_NAMES.SESSION_INTERRUPTED);
    expect(handler).toBeDefined();

    const mockEnvelope: EventEnvelope = {
      type: "event",
      event: EVENT_NAMES.SESSION_INTERRUPTED,
      sessionId: "sess-live",
      seq: 1,
      timestamp: Date.now(),
      payload: { sessionId: "sess-live" },
    };
    handler!({ sessionId: "sess-live" }, mockEnvelope);

    const cached = service.getCachedSessions().find((s) => s.sessionId === "sess-live");
    expect(cached?.isInterrupted).toBe(true);
    expect(cached?.taskState).toBe("interrupted");
  });
});
