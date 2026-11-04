/**
 * Audit Logger for Kairo Agent Privileged Operations.
 *
 * Records structured, sanitized metadata for all tool executions, policy decisions,
 * and user approvals without logging raw credentials, secrets, or auth headers.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";
import { redactObject, redactSecrets } from "../utils/redaction";
import { PermissionAction, RiskLevel } from "../permissions/types";

export type AuditDecision =
  | "allowed_auto"
  | "approval_requested"
  | "approved_by_user"
  | "rejected_by_user"
  | "denied_by_policy"
  | "timed_out";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId?: string;
  toolName: string;
  action: PermissionAction;
  risk: RiskLevel;
  decision: AuditDecision;
  target?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLoggerOptions {
  logFilePath?: string;
}

export class AuditLogger {
  private readonly logFilePath: string;
  private isInitialized = false;

  constructor(options: AuditLoggerOptions = {}) {
    this.logFilePath =
      options.logFilePath || path.join(os.homedir(), ".kairo", "logs", "audit.jsonl");
  }

  private async ensureDirectory(): Promise<void> {
    if (this.isInitialized) return;
    const dir = path.dirname(this.logFilePath);
    await fs.mkdir(dir, { recursive: true });
    this.isInitialized = true;
  }

  /**
   * Records an audit log entry with strict credential and secret scrubbing.
   */
  public async log(params: {
    sessionId: string;
    agentId?: string;
    toolName: string;
    action: PermissionAction;
    risk: RiskLevel;
    decision: AuditDecision;
    target?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntry> {
    await this.ensureDirectory();

    const sanitizedTarget = params.target ? redactSecrets(params.target) : undefined;
    const sanitizedReason = params.reason ? redactSecrets(params.reason) : undefined;
    const sanitizedMetadata = params.metadata ? redactObject(params.metadata) : undefined;

    const entry: AuditLogEntry = {
      id: `audit_${nanoid(12)}`,
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId,
      agentId: params.agentId,
      toolName: params.toolName,
      action: params.action,
      risk: params.risk,
      decision: params.decision,
      target: sanitizedTarget,
      reason: sanitizedReason,
      metadata: sanitizedMetadata,
    };

    const line = JSON.stringify(entry) + "\n";
    try {
      await fs.appendFile(this.logFilePath, line, "utf8");
    } catch (err) {
      // In audit logging, failure to write to disk should not crash the host process
      console.error("Failed to write audit log entry:", err);
    }

    return entry;
  }

  /**
   * Reads recent audit log entries from disk.
   */
  public async readRecentEntries(limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logFilePath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const entries = lines
        .slice(-limit)
        .map((l) => {
          try {
            return JSON.parse(l) as AuditLogEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is AuditLogEntry => e !== null);
      return entries;
    } catch {
      return [];
    }
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}
