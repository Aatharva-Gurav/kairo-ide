import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { ToolApprovalRequest, ToolApprovalResult } from "@cline/shared";
import { Logger } from "../utils/logger";
import {
  ApprovalRecord,
  ApprovalStatus,
  PermissionAction,
  RiskLevel,
  ToolApprovalNotifierPayload,
} from "./types";

export type ApprovalNotifier = (approval: ToolApprovalNotifierPayload) => void;

export interface CreateApprovalParams {
  request: ToolApprovalRequest;
  action: PermissionAction;
  risk: RiskLevel;
  workspace: string;
  timeoutMs?: number;
}

export class ApprovalCoordinator {
  private readonly pendingApprovals = new Map<string, ApprovalRecord>();
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

  /**
   * Computes a deterministic SHA-256 hash of canonicalized JSON arguments.
   */
  public computeArgumentsHash(input: unknown): string {
    try {
      const canonical = typeof input === "object" && input !== null
        ? JSON.stringify(input, Object.keys(input as Record<string, unknown>).sort())
        : JSON.stringify(input);
      return crypto.createHash("sha256").update(canonical || "").digest("hex");
    } catch {
      return crypto.createHash("sha256").update(String(input)).digest("hex");
    }
  }

  /**
   * Registers and holds an approval request until resolved by the user or timed out.
   */
  public async requestApproval(
    requestOrParams: ToolApprovalRequest | CreateApprovalParams
  ): Promise<ToolApprovalResult> {
    const isFullParams = "action" in requestOrParams;
    const request = isFullParams ? requestOrParams.request : requestOrParams;
    const action: PermissionAction = isFullParams ? requestOrParams.action : "unknown";
    const risk: RiskLevel = isFullParams ? requestOrParams.risk : "high";
    const workspace: string = isFullParams ? requestOrParams.workspace : process.cwd();
    const timeoutMs = isFullParams && requestOrParams.timeoutMs ? requestOrParams.timeoutMs : this.defaultTimeoutMs;

    const approvalId = `appr_${nanoid(12)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + timeoutMs;
    const argumentsHash = this.computeArgumentsHash(request.input);

    this.logger.info(
      `Tool approval requested: ${approvalId} for tool '${request.toolName}' (action: ${action}, risk: ${risk}, session: ${request.sessionId})`
    );

    return new Promise<ToolApprovalResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const record = this.pendingApprovals.get(approvalId);
        if (record) {
          record.status = "expired";
          this.pendingApprovals.delete(approvalId);
          this.logger.warn(`Approval ${approvalId} timed out after ${timeoutMs}ms`);
          resolve({
            approved: false,
            reason: `Tool approval request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
          });
        }
      }, timeoutMs);

      const record: ApprovalRecord = {
        approvalId,
        sessionId: request.sessionId,
        taskId: request.conversationId || request.sessionId,
        agentId: request.agentId || "lead-agent",
        toolName: request.toolName,
        action,
        risk,
        exactArguments: request.input,
        argumentsHash,
        workspace,
        createdAt,
        expiresAt,
        status: "pending",
        resolve,
        reject,
        timer,
      };

      this.pendingApprovals.set(approvalId, record);

      if (this.notifier) {
        try {
          this.notifier({
            approvalId,
            sessionId: record.sessionId,
            taskId: record.taskId,
            agentId: record.agentId,
            toolName: record.toolName,
            action: record.action,
            risk: record.risk,
            exactArguments: record.exactArguments,
            argumentsHash: record.argumentsHash,
            workspace: record.workspace,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
          });
        } catch (err) {
          this.logger.error(`Failed to notify approval request ${approvalId}`, err);
        }
      } else {
        this.logger.warn(`No approval notifier registered for request ${approvalId}`);
      }
    });
  }

  /**
   * Resolves a pending tool approval.
   *
   * @param approvalId The unique approval request ID.
   * @param approved Whether user approved or denied the tool.
   * @param reason Optional rejection reason.
   * @param sessionId Optional session ID for session-ownership validation.
   * @returns boolean true if resolved successfully, false if not found, wrong session, or already resolved.
   */
  public resolveApproval(
    approvalId: string,
    approved: boolean,
    reason?: string,
    sessionId?: string
  ): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      this.logger.warn(`Attempted to resolve unknown or expired approval: ${approvalId}`);
      return false;
    }

    // Session binding validation: prevent cross-session approvals
    if (sessionId && pending.sessionId !== sessionId) {
      this.logger.error(
        `Cross-session approval rejected: approval ${approvalId} belongs to session '${pending.sessionId}', not '${sessionId}'`
      );
      return false;
    }

    // Check expiration
    if (Date.now() > pending.expiresAt) {
      this.logger.warn(`Attempted to resolve expired approval: ${approvalId}`);
      if (pending.timer) clearTimeout(pending.timer);
      this.pendingApprovals.delete(approvalId);
      pending.resolve?.({
        approved: false,
        reason: "Approval expired",
      });
      return false;
    }

    if (pending.timer) clearTimeout(pending.timer);
    this.pendingApprovals.delete(approvalId); // ONE-SHOT: Immediately delete to prevent replay attacks

    pending.status = approved ? "approved" : "rejected";
    this.logger.info(`Resolved approval ${approvalId}: approved=${approved}${reason ? ` (${reason})` : ""}`);

    pending.resolve?.({
      approved,
      reason: approved ? undefined : (reason || "User rejected tool execution"),
    });

    return true;
  }

  public getApproval(approvalId: string): ApprovalRecord | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  public abortForSession(sessionId: string, reason: string = "Session aborted"): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      if (pending.sessionId === sessionId) {
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingApprovals.delete(id);
        pending.status = "rejected";
        pending.resolve?.({
          approved: false,
          reason,
        });
      }
    }
  }

  public abortAll(reason: string = "Runtime shutting down"): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.status = "rejected";
      pending.resolve?.({
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
