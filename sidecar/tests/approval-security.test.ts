import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { Logger } from "../utils/logger";
import type { ToolApprovalRequest } from "@cline/shared";

describe("ApprovalCoordinator Security & Lifecycle", () => {
  let coordinator: ApprovalCoordinator;
  const logger = new Logger("test-approval-security");

  beforeEach(() => {
    // 500ms timeout for testing expiration
    coordinator = new ApprovalCoordinator(logger, 500);
  });

  afterEach(() => {
    coordinator.abortAll();
  });

  it("binds all 9 metadata fields and computes deterministic argumentsHash", async () => {
    let capturedPayload: any = null;
    coordinator.setNotifier((payload) => {
      capturedPayload = payload;
    });

    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-abc-123",
      agentId: "agent-sub-1",
      conversationId: "task-conv-456",
      iteration: 2,
      toolCallId: "tool-call-789",
      toolName: "editor",
      input: { command: "replace", path: "src/main.ts", text: "const x = 1;" },
      policy: { enabled: true },
    };

    const approvalPromise = coordinator.requestApproval({
      request: mockRequest,
      action: "modify_file",
      risk: "moderate",
      workspace: "C:\\Projects\\MyApp",
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(capturedPayload).toBeDefined();
    // 1. Request ID
    expect(capturedPayload.approvalId).toMatch(/^appr_[a-zA-Z0-9_-]+/);
    // 2. Session ID
    expect(capturedPayload.sessionId).toBe("session-abc-123");
    // 3. Task ID
    expect(capturedPayload.taskId).toBe("task-conv-456");
    // 4. Agent ID
    expect(capturedPayload.agentId).toBe("agent-sub-1");
    // 5. Tool name
    expect(capturedPayload.toolName).toBe("editor");
    // 6. Exact arguments
    expect(capturedPayload.exactArguments).toEqual(mockRequest.input);
    // 7. Workspace
    expect(capturedPayload.workspace).toBe("C:\\Projects\\MyApp");
    // 8. Risk classification
    expect(capturedPayload.risk).toBe("moderate");
    // 9. Creation & Expiration times
    expect(capturedPayload.createdAt).toBeGreaterThan(0);
    expect(capturedPayload.expiresAt).toBeGreaterThan(capturedPayload.createdAt);
    // Deterministic argumentsHash (SHA-256)
    expect(capturedPayload.argumentsHash).toBe(coordinator.computeArgumentsHash(mockRequest.input));

    // Resolve cleanly
    coordinator.resolveApproval(capturedPayload.approvalId, true);
    const res = await approvalPromise;
    expect(res.approved).toBe(true);
  });

  it("enforces ONE-SHOT approval consumption (prevents replay attacks)", async () => {
    let approvalId = "";
    coordinator.setNotifier((notif) => {
      approvalId = notif.approvalId;
    });

    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-replay",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-1",
      toolName: "delete_file",
      input: { path: "unwanted.ts" },
      policy: { enabled: true },
    };

    const promise = coordinator.requestApproval({
      request: mockRequest,
      action: "delete_file",
      risk: "high",
      workspace: "/app",
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(approvalId).toBeTruthy();

    // 1. First resolution succeeds
    const firstResolve = coordinator.resolveApproval(approvalId, true);
    expect(firstResolve).toBe(true);

    const res = await promise;
    expect(res.approved).toBe(true);

    // 2. Second resolution attempt with the same approval ID MUST fail (replay defense)
    const replayAttempt = coordinator.resolveApproval(approvalId, true);
    expect(replayAttempt).toBe(false);
  });

  it("rejects cross-session approval resolution attempts", async () => {
    let approvalId = "";
    coordinator.setNotifier((notif) => {
      approvalId = notif.approvalId;
    });

    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-target",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-1",
      toolName: "run_commands",
      input: { command: "npm test" },
      policy: { enabled: true },
    };

    const promise = coordinator.requestApproval({
      request: mockRequest,
      action: "execute_command",
      risk: "high",
      workspace: "/app",
    });

    await new Promise((r) => setTimeout(r, 20));

    // Attempt to resolve approval from a DIFFERENT session
    const crossSessionResolve = coordinator.resolveApproval(
      approvalId,
      true,
      undefined,
      "session-attacker" // Wrong session!
    );
    expect(crossSessionResolve).toBe(false);

    // Now resolve with the CORRECT session
    const legitimateResolve = coordinator.resolveApproval(
      approvalId,
      true,
      undefined,
      "session-target"
    );
    expect(legitimateResolve).toBe(true);

    const res = await promise;
    expect(res.approved).toBe(true);
  });

  it("enforces approval timeout expiration", async () => {
    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-timeout",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-timeout",
      toolName: "delete_file",
      input: { path: "temp.txt" },
      policy: { enabled: true },
    };

    // Coordinator configured with 200ms timeout
    const fastCoordinator = new ApprovalCoordinator(logger, 200);

    let approvalId = "";
    fastCoordinator.setNotifier((notif) => {
      approvalId = notif.approvalId;
    });

    const promise = fastCoordinator.requestApproval({
      request: mockRequest,
      action: "delete_file",
      risk: "high",
      workspace: "/app",
      timeoutMs: 150,
    });

    // Wait 250ms for expiration to trigger
    await new Promise((r) => setTimeout(r, 250));

    const res = await promise;
    expect(res.approved).toBe(false);
    expect(res.reason).toContain("timed out");

    // Attempting to resolve after expiration fails
    const lateResolve = fastCoordinator.resolveApproval(approvalId, true);
    expect(lateResolve).toBe(false);
  });

  it("cleans up and rejects all pending approvals when session is aborted", async () => {
    const req1: ToolApprovalRequest = {
      sessionId: "session-to-abort",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-1",
      toolName: "editor",
      input: { command: "create", path: "a.ts" },
      policy: { enabled: true },
    };

    const req2: ToolApprovalRequest = {
      sessionId: "session-other",
      agentId: "agent-2",
      conversationId: "conv-2",
      iteration: 1,
      toolCallId: "call-2",
      toolName: "editor",
      input: { command: "create", path: "b.ts" },
      policy: { enabled: true },
    };

    const promise1 = coordinator.requestApproval(req1);
    const promise2 = coordinator.requestApproval(req2);

    expect(coordinator.getPendingCount()).toBe(2);

    // Abort session 1
    coordinator.abortForSession("session-to-abort", "User aborted task");

    const res1 = await promise1;
    expect(res1.approved).toBe(false);
    expect(res1.reason).toBe("User aborted task");

    // Session 2 should still be pending
    expect(coordinator.getPendingCount()).toBe(1);
  });
});
