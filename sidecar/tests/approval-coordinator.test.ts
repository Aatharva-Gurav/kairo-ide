import { describe, it, expect } from "bun:test";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { Logger } from "../utils/logger";
import type { ToolApprovalRequest } from "@cline/shared";

describe("ApprovalCoordinator", () => {
  const logger = new Logger("test-approval");

  it("requests and approves a tool execution", async () => {
    const coordinator = new ApprovalCoordinator(logger, 2000);
    let notifiedApprovalId: string | null = null;

    coordinator.setNotifier((approval) => {
      notifiedApprovalId = approval.approvalId;
    });

    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-123",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-abc",
      toolName: "execute_command",
      input: { command: "ls -la" },
      policy: "requires_approval" as any,
    };

    // Trigger request asynchronously
    const approvalPromise = coordinator.requestApproval(mockRequest);

    expect(coordinator.getPendingCount()).toBe(1);
    expect(notifiedApprovalId).not.toBeNull();

    // Resolve the approval
    const resolved = coordinator.resolveApproval(notifiedApprovalId!, true);
    expect(resolved).toBe(true);

    const result = await approvalPromise;
    expect(result.approved).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(coordinator.getPendingCount()).toBe(0);
  });

  it("rejects a tool execution with user reason", async () => {
    const coordinator = new ApprovalCoordinator(logger, 2000);
    let notifiedApprovalId: string | null = null;

    coordinator.setNotifier((approval) => {
      notifiedApprovalId = approval.approvalId;
    });

    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-123",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-xyz",
      toolName: "delete_file",
      input: { path: "/important.txt" },
      policy: "requires_approval" as any,
    };

    const approvalPromise = coordinator.requestApproval(mockRequest);
    coordinator.resolveApproval(notifiedApprovalId!, false, "User denied file deletion");

    const result = await approvalPromise;
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("User denied file deletion");
  });

  it("aborts pending approvals for a session", async () => {
    const coordinator = new ApprovalCoordinator(logger, 5000);
    const mockRequest: ToolApprovalRequest = {
      sessionId: "session-abort",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-1",
      toolName: "shell",
      input: {},
      policy: "requires_approval" as any,
    };

    const approvalPromise = coordinator.requestApproval(mockRequest);
    expect(coordinator.getPendingCount()).toBe(1);

    coordinator.abortForSession("session-abort", "Session was aborted by user");
    const result = await approvalPromise;

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("Session was aborted by user");
    expect(coordinator.getPendingCount()).toBe(0);
  });
});
