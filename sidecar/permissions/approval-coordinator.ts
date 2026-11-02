import { nanoid } from "nanoid";
import type { ToolApprovalRequest, ToolApprovalResult } from "@cline/shared";
import { Logger } from "../utils/logger";

export interface PendingApproval {
  approvalId: string;
  request: ToolApprovalRequest;
  resolve: (result: ToolApprovalResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

export type ApprovalNotifier = (approval: {
  approvalId: string;
  sessionId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  policy: unknown;
}) => void;

export class ApprovalCoordinator {
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly logger: Logger;
  private notifier: ApprovalNotifier | null = null;
  private readonly defaultTimeoutMs: number;

  constructor(logger: Logger, defaultTimeoutMs: number = 300000) { // 5 minutes
    this.logger = logger.child("approval-coordinator");
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  public setNotifier(notifier: ApprovalNotifier): void {
    this.notifier = notifier;
  }

  public async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalResult> {
    const approvalId = `appr_${nanoid(12)}`;
    this.logger.info(`Tool approval requested: ${approvalId} for tool ${request.toolName} (session: ${request.sessionId})`);

    return new Promise<ToolApprovalResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        this.logger.warn(`Approval ${approvalId} timed out after ${this.defaultTimeoutMs}ms`);
        resolve({
          approved: false,
          reason: `Tool approval request timed out after ${Math.round(this.defaultTimeoutMs / 1000)} seconds`,
        });
      }, this.defaultTimeoutMs);

      this.pendingApprovals.set(approvalId, {
        approvalId,
        request,
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });

      if (this.notifier) {
        try {
          this.notifier({
            approvalId,
            sessionId: request.sessionId,
            agentId: request.agentId,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            input: request.input,
            policy: request.policy,
          });
        } catch (err) {
          this.logger.error(`Failed to notify approval request ${approvalId}`, err);
        }
      } else {
        this.logger.warn(`No approval notifier registered for request ${approvalId}`);
      }
    });
  }

  public resolveApproval(approvalId: string, approved: boolean, reason?: string): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      this.logger.warn(`Attempted to resolve unknown or expired approval: ${approvalId}`);
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(approvalId);

    this.logger.info(`Resolved approval ${approvalId}: approved=${approved}${reason ? ` (${reason})` : ""}`);
    pending.resolve({
      approved,
      reason: approved ? undefined : (reason || "User rejected tool execution"),
    });
    return true;
  }

  public abortForSession(sessionId: string, reason: string = "Session aborted"): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      if (pending.request.sessionId === sessionId) {
        clearTimeout(pending.timer);
        this.pendingApprovals.delete(id);
        pending.resolve({
          approved: false,
          reason,
        });
      }
    }
  }

  public abortAll(reason: string = "Runtime shutting down"): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({
        approved: false,
        reason,
      });
    }
    this.pendingApprovals.clear();
  }

  public getPendingCount(): number {
    return this.pendingApprovals.size;
  }
}
