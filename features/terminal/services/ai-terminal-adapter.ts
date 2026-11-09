import { invokeCommand, isTauriEnvironment } from "@/lib/tauri-ipc";
import {
  RunCommandRequest,
  RunCommandResponse,
  RunBackgroundCommandRequest,
  RunBackgroundCommandResponse,
  GetCommandOutputRequest,
  GetCommandOutputResponse,
  ListProcessesRequest,
  ListProcessesResponse,
  StopProcessRequest,
  StopProcessResponse,
  TrackedAiProcess,
} from "../types";

export interface AuditRecord {
  id: string;
  timestamp: number;
  command: string;
  cwd?: string;
  action: "run" | "background" | "stop";
  decision: "approved" | "denied" | "auto_trusted" | "blocked_destructive";
  reason?: string;
  exitCode?: number;
  executionTimeMs?: number;
}

export type ApprovalRequester = (details: {
  command: string;
  cwd?: string;
  isBackground: boolean;
  risk: "low" | "medium" | "high" | "critical";
}) => Promise<boolean>;

// High-risk patterns that must never run automatically and require highest scrutiny or denial
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-[a-zA-Z0-9_\-\s]*[rR][a-zA-Z0-9_\-\s]*[fF]\s+([/\\]|\*|~)/i,
  /\brm\s+-[a-zA-Z0-9_\-\s]*[fF][a-zA-Z0-9_\-\s]*[rR]\s+([/\\]|\*|~)/i,
  /\bdel\s+.*\/[sS].*([a-zA-Z]:[\\/]|\*)/i,
  /\brmdir\s+.*\/[sS].*[a-zA-Z]:[\\/]/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bmkfs(\.[a-zA-Z0-9]+)?\s+/i,
  /\b(shutdown|reboot)\b/i,
  /\b(curl|wget)\b[^\n|;&]+\|\s*(sh|bash|zsh|powershell|pwsh)\b/i,
];

// Read-only or safe commands that can match a user's trusted command policy
const DEFAULT_TRUSTED_PATTERNS = [
  /^git\s+(status|diff|log|branch|tag|show)(\s+.*)?$/i,
  /^npm\s+(test|run\s+test|run\s+lint|--version)(\s+.*)?$/i,
  /^cargo\s+(test|check|--version)(\s+.*)?$/i,
  /^(node|python|cargo|rustc|go|git)\s+--version$/i,
  /^dir(\s+.*)?$/i,
  /^ls(\s+.*)?$/i,
  /^pwd$/i,
  /^echo\s+.*$/i,
];

// Secret redaction regex (tokens, bearer auth, API keys)
const SECRET_REDACTION_REGEX =
  /(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|bearer\s+[a-zA-Z0-9._\-]{20,}|password=["'][^"']+["'])/gi;

export class AiTerminalExecutionAdapter {
  private auditLogs: AuditRecord[] = [];
  private trustedPatterns: RegExp[] = [...DEFAULT_TRUSTED_PATTERNS];
  private approvalRequester: ApprovalRequester | null = null;
  private autoTrustSafeCommands = false;

  constructor(options?: {
    approvalRequester?: ApprovalRequester;
    autoTrustSafeCommands?: boolean;
    customTrustedPatterns?: RegExp[];
  }) {
    if (options?.approvalRequester) {
      this.approvalRequester = options.approvalRequester;
    }
    if (options?.autoTrustSafeCommands !== undefined) {
      this.autoTrustSafeCommands = options.autoTrustSafeCommands;
    }
    if (options?.customTrustedPatterns) {
      this.trustedPatterns = [...this.trustedPatterns, ...options.customTrustedPatterns];
    }
  }

  public setApprovalRequester(requester: ApprovalRequester): void {
    this.approvalRequester = requester;
  }

  public setAutoTrustSafeCommands(enabled: boolean): void {
    this.autoTrustSafeCommands = enabled;
  }

  public getAuditLogs(): AuditRecord[] {
    return [...this.auditLogs];
  }

  public clearAuditLogs(): void {
    this.auditLogs = [];
  }

  /**
   * Evaluates command safety, security risk and approval policy.
   */
  public evaluateSecurity(
    command: string,
    isBackground = false
  ): {
    decision: "approved" | "denied" | "auto_trusted" | "blocked_destructive" | "requires_approval";
    risk: "low" | "medium" | "high" | "critical";
    reason?: string;
  } {
    const trimmed = command.trim();

    // 1. Check for destructive patterns
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          decision: "blocked_destructive",
          risk: "critical",
          reason: "Command matches blocked destructive pattern (unrestricted system or disk deletion).",
        };
      }
    }

    // 2. Check for auto-trusted read-only patterns
    if (this.autoTrustSafeCommands) {
      for (const pattern of this.trustedPatterns) {
        if (pattern.test(trimmed)) {
          return {
            decision: "auto_trusted",
            risk: "low",
            reason: "Command matches configured trusted safe policy.",
          };
        }
      }
    }

    // 3. Default policy: requires explicit user approval
    const risk = isBackground ? "high" : "medium";
    return {
      decision: "requires_approval",
      risk,
    };
  }

  /**
   * Masks secrets, credentials, and API keys from output and logs.
   */
  public redactSecrets(text: string): string {
    if (!text) return text;
    return text.replace(SECRET_REDACTION_REGEX, "[REDACTED_SECRET]");
  }

  /**
   * Executes a command synchronously with timeout, output bounds, and audit logging.
   */
  public async run_command(request: RunCommandRequest): Promise<RunCommandResponse> {
    const security = this.evaluateSecurity(request.command, false);

    if (security.decision === "blocked_destructive") {
      this.logAudit({
        command: request.command,
        cwd: request.cwd,
        action: "run",
        decision: "blocked_destructive",
        reason: security.reason,
      });
      throw new Error(`[SecurityException] Execution denied: ${security.reason}`);
    }

    let approved = security.decision === "auto_trusted" || request.trusted;
    if (!approved && this.approvalRequester) {
      approved = await this.approvalRequester({
        command: request.command,
        cwd: request.cwd,
        isBackground: false,
        risk: security.risk,
      });
    }

    if (!approved) {
      this.logAudit({
        command: request.command,
        cwd: request.cwd,
        action: "run",
        decision: "denied",
        reason: "User denied execution or approval timed out.",
      });
      throw new Error("[SecurityException] Command execution was denied by user permission policy.");
    }

    this.logAudit({
      command: request.command,
      cwd: request.cwd,
      action: "run",
      decision: security.decision === "auto_trusted" ? "auto_trusted" : "approved",
    });

    if (!isTauriEnvironment()) {
      // Mock result for unit test environment
      return {
        exitCode: 0,
        stdout: `[Mock Execution]: ${request.command}\n`,
        stderr: "",
        executionTimeMs: 10,
        truncated: false,
      };
    }

    const rawResult = await invokeCommand<RunCommandResponse>("ai_terminal_run_command", {
      command: request.command,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      maxOutputBytes: request.maxOutputBytes,
    });

    return {
      ...rawResult,
      stdout: this.redactSecrets(rawResult.stdout),
      stderr: this.redactSecrets(rawResult.stderr),
    };
  }

  /**
   * Spawns a background command and tracks its lifecycle.
   */
  public async run_background_command(
    request: RunBackgroundCommandRequest
  ): Promise<RunBackgroundCommandResponse> {
    const security = this.evaluateSecurity(request.command, true);

    if (security.decision === "blocked_destructive") {
      this.logAudit({
        command: request.command,
        cwd: request.cwd,
        action: "background",
        decision: "blocked_destructive",
        reason: security.reason,
      });
      throw new Error(`[SecurityException] Execution denied: ${security.reason}`);
    }

    let approved = security.decision === "auto_trusted" || request.trusted;
    if (!approved && this.approvalRequester) {
      approved = await this.approvalRequester({
        command: request.command,
        cwd: request.cwd,
        isBackground: true,
        risk: security.risk,
      });
    }

    if (!approved) {
      this.logAudit({
        command: request.command,
        cwd: request.cwd,
        action: "background",
        decision: "denied",
        reason: "User denied execution or approval timed out.",
      });
      throw new Error("[SecurityException] Background command execution was denied by user permission policy.");
    }

    this.logAudit({
      command: request.command,
      cwd: request.cwd,
      action: "background",
      decision: security.decision === "auto_trusted" ? "auto_trusted" : "approved",
    });

    if (!isTauriEnvironment()) {
      return {
        processId: 12345,
        executionId: `mock_proc_${Date.now()}`,
        command: request.command,
        cwd: request.cwd || process.cwd(),
        startedAt: Date.now(),
      };
    }

    return await invokeCommand<RunBackgroundCommandResponse>("ai_terminal_run_background", {
      command: request.command,
      cwd: request.cwd,
      maxOutputBytes: request.maxOutputBytes,
    });
  }

  /**
   * Retrieves buffered output and current status for a background process.
   */
  public async get_command_output(
    request: GetCommandOutputRequest
  ): Promise<GetCommandOutputResponse> {
    if (!isTauriEnvironment()) {
      return {
        executionId: request.executionId,
        status: "completed",
        exitCode: 0,
        stdout: "[Mock Output]",
        stderr: "",
      };
    }

    const raw = await invokeCommand<GetCommandOutputResponse>("ai_terminal_get_output", {
      executionId: request.executionId,
    });

    return {
      ...raw,
      stdout: this.redactSecrets(raw.stdout),
      stderr: this.redactSecrets(raw.stderr),
    };
  }

  /**
   * Lists all running non-interactive processes.
   */
  public async list_running_processes(
    request: ListProcessesRequest = {}
  ): Promise<ListProcessesResponse> {
    if (!isTauriEnvironment()) {
      return { processes: [] };
    }

    const processes = await invokeCommand<TrackedAiProcess[]>("ai_terminal_list_processes", {
      onlyActive: request.onlyActive,
    });

    return { processes };
  }

  /**
   * Stops an active process tree.
   */
  public async stop_process(request: StopProcessRequest): Promise<StopProcessResponse> {
    this.logAudit({
      command: `kill ${request.executionId}`,
      action: "stop",
      decision: "approved",
    });

    if (!isTauriEnvironment()) {
      return { stopped: true };
    }

    try {
      await invokeCommand<void>("ai_terminal_stop_process", {
        executionId: request.executionId,
      });
      return { stopped: true };
    } catch (err) {
      return { stopped: false, reason: String(err) };
    }
  }

  private logAudit(entry: Omit<AuditRecord, "id" | "timestamp">): void {
    const record: AuditRecord = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      command: this.redactSecrets(entry.command),
    };
    this.auditLogs.push(record);
  }
}
