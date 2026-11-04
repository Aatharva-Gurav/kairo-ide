/**
 * Central Permission Manager for Kairo AI Agent.
 *
 * Enforces default-deny security, granular action classification,
 * Plan Mode hard boundaries, workspace path sandboxing, and one-shot user approvals.
 */
import type { ToolApprovalRequest, ToolApprovalResult } from "@cline/shared";
import { Logger } from "../utils/logger";
import { ApprovalCoordinator } from "./approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { CommandGuard } from "../security/command-guard";
import { AuditLogger } from "../security/audit-logger";
import { PermissionAction, RiskLevel } from "./types";

export interface SessionContextProvider {
  getSessionWorkspace(sessionId: string): string | undefined;
  getSessionMode(sessionId: string): "plan" | "act";
}

export interface PermissionManagerOptions {
  logger: Logger;
  approvalCoordinator: ApprovalCoordinator;
  pathValidator?: PathValidator;
  commandGuard?: CommandGuard;
  auditLogger?: AuditLogger;
  sessionContextProvider?: SessionContextProvider;
}

export class PermissionManager {
  private readonly logger: Logger;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly pathValidator: PathValidator;
  private readonly commandGuard: CommandGuard;
  private readonly auditLogger: AuditLogger;
  private sessionContextProvider?: SessionContextProvider;

  constructor(options: PermissionManagerOptions) {
    this.logger = options.logger.child("permission-manager");
    this.approvalCoordinator = options.approvalCoordinator;
    this.pathValidator = options.pathValidator ?? new PathValidator();
    this.commandGuard = options.commandGuard ?? new CommandGuard();
    this.auditLogger = options.auditLogger ?? new AuditLogger();
    this.sessionContextProvider = options.sessionContextProvider;
  }

  public setSessionContextProvider(provider: SessionContextProvider): void {
    this.sessionContextProvider = provider;
  }

  public getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  public getPathValidator(): PathValidator {
    return this.pathValidator;
  }

  public getCommandGuard(): CommandGuard {
    return this.commandGuard;
  }

  /**
   * Classify a tool call into a granular PermissionAction and RiskLevel.
   */
  public classifyTool(
    toolName: string,
    input: unknown
  ): { action: PermissionAction; risk: RiskLevel } {
    const name = toolName.toLowerCase();
    const typedInput = (input || {}) as Record<string, unknown>;

    // Read-only filesystem operations
    if (name === "read_files" || name === "read_file" || name === "readfile") {
      return { action: "read_file", risk: "read_only" };
    }
    if (name === "search_codebase" || name === "search_files" || name === "searchfiles") {
      return { action: "search_files", risk: "read_only" };
    }
    if (name === "list_directory" || name === "list_files" || name === "listfiles") {
      return { action: "list_directory", risk: "read_only" };
    }

    // Clarifying questions
    if (name === "ask_question" || name === "askquestion") {
      return { action: "read_file", risk: "low" };
    }

    // Editor tool: inspect sub-command
    if (name === "editor" || name === "edit_file" || name === "editfile") {
      const command = String(typedInput.command || "").toLowerCase();
      if (command === "create") {
        return { action: "create_file", risk: "moderate" };
      }
      if (command === "delete" || command === "remove") {
        return { action: "delete_file", risk: "high" };
      }
      if (command === "rename" || command === "move") {
        return { action: "rename_file", risk: "moderate" };
      }
      return { action: "modify_file", risk: "moderate" };
    }

    // Canonical patch application
    if (name === "apply_patch" || name === "applypatch") {
      return { action: "modify_file", risk: "moderate" };
    }

    // Direct deletion
    if (name === "delete_file" || name === "deletefile") {
      return { action: "delete_file", risk: "high" };
    }

    // Direct moving / renaming
    if (name === "move_file" || name === "movefile") {
      return { action: "move_file", risk: "high" };
    }
    if (name === "rename_file" || name === "renamefile") {
      return { action: "rename_file", risk: "moderate" };
    }

    // Shell command execution
    if (name === "run_commands" || name === "execute_command" || name === "bash") {
      const cmdStr = typeof typedInput.command === "string"
        ? typedInput.command
        : typeof typedInput.commandLine === "string"
        ? typedInput.commandLine
        : Array.isArray(typedInput.commands)
        ? typedInput.commands.join(" && ")
        : "";

      const inspection = this.commandGuard.inspect(cmdStr);
      return { action: inspection.action, risk: inspection.risk };
    }

    // Network fetch
    if (name === "fetch_web_content" || name === "web_fetch" || name === "webfetch") {
      return { action: "access_network", risk: "high" };
    }

    // MCP Tools
    if (name.startsWith("mcp_") || name.startsWith("mcp:")) {
      return { action: "start_mcp_server", risk: "high" };
    }

    // Unknown tool: Default Deny!
    return { action: "unknown", risk: "critical" };
  }

  /**
   * Extract all file paths specified in a tool input.
   */
  public extractPathsFromInput(input: unknown): string[] {
    if (!input || typeof input !== "object") return [];
    const typed = input as Record<string, unknown>;
    const paths: string[] = [];

    if (typeof typed.path === "string") paths.push(typed.path);
    if (typeof typed.targetPath === "string") paths.push(typed.targetPath);
    if (typeof typed.filePath === "string") paths.push(typed.filePath);
    if (typeof typed.file_path === "string") paths.push(typed.file_path);
    if (typeof typed.sourcePath === "string") paths.push(typed.sourcePath);
    if (typeof typed.destinationPath === "string") paths.push(typed.destinationPath);

    if (Array.isArray(typed.paths)) {
      for (const p of typed.paths) {
        if (typeof p === "string") paths.push(p);
      }
    }
    if (Array.isArray(typed.files)) {
      for (const f of typed.files) {
        if (typeof f === "string") paths.push(f);
        else if (f && typeof f === "object" && typeof (f as any).path === "string") {
          paths.push((f as any).path);
        }
      }
    }

    return paths;
  }

  /**
   * Primary entrypoint: handles tool approval requests from ClineCore.
   *
   * @param request The SDK ToolApprovalRequest
   */
  public async handleToolApprovalRequest(
    request: ToolApprovalRequest
  ): Promise<ToolApprovalResult> {
    const sessionId = request.sessionId;
    const toolName = request.toolName;
    const input = request.input;

    const workspaceRoot =
      this.sessionContextProvider?.getSessionWorkspace(sessionId) || process.cwd();
    const mode =
      this.sessionContextProvider?.getSessionMode(sessionId) || "act";

    // 1. Granular classification
    const { action, risk } = this.classifyTool(toolName, input);

    // 2. Default-Deny on Unknown tools
    if (action === "unknown") {
      const reason = `Tool '${toolName}' is not recognized or permitted. Unknown operations are denied by default.`;
      this.logger.warn(`Denied unknown tool '${toolName}' for session ${sessionId}`);
      await this.auditLogger.log({
        sessionId,
        agentId: request.agentId,
        toolName,
        action,
        risk,
        decision: "denied_by_policy",
        reason,
      });
      return { approved: false, reason };
    }

    // 3. Plan Mode Enforcement
    if (mode === "plan") {
      const isMutating =
        action === "create_file" ||
        action === "modify_file" ||
        action === "delete_file" ||
        action === "move_file" ||
        action === "rename_file" ||
        action === "install_dependency";

      if (isMutating) {
        const reason = `Tool execution denied: mutating operations (${action}) are prohibited in Plan Mode. Please formulate a plan for user approval.`;
        this.logger.warn(`Plan mode blocked mutating tool '${toolName}' for session ${sessionId}`);
        await this.auditLogger.log({
          sessionId,
          agentId: request.agentId,
          toolName,
          action,
          risk,
          decision: "denied_by_policy",
          reason,
        });
        return { approved: false, reason };
      }

      // Shell commands in Plan Mode: inspect for file modifications
      if (action === "execute_command") {
        const cmdStr = typeof (input as any)?.command === "string"
          ? (input as any).command
          : "";
        const inspection = this.commandGuard.inspect(cmdStr, "plan");
        if (inspection.isPlanModeBlocked) {
          const reason = inspection.reason || `Command '${cmdStr}' is blocked in Plan Mode.`;
          this.logger.warn(`Plan mode blocked shell command for session ${sessionId}: ${reason}`);
          await this.auditLogger.log({
            sessionId,
            agentId: request.agentId,
            toolName,
            action,
            risk,
            decision: "denied_by_policy",
            target: cmdStr,
            reason,
          });
          return { approved: false, reason };
        }
      }
    }

    // 4. Path Security Validation
    const extractedPaths = this.extractPathsFromInput(input);
    for (const targetPath of extractedPaths) {
      const validation = this.pathValidator.validate(targetPath, workspaceRoot);
      if (!validation.valid) {
        const reason = `Path security violation: ${validation.error}`;
        this.logger.error(`Path validation failed for session ${sessionId}: ${validation.error}`);
        await this.auditLogger.log({
          sessionId,
          agentId: request.agentId,
          toolName,
          action,
          risk: "critical",
          decision: "denied_by_policy",
          target: targetPath,
          reason,
        });
        return { approved: false, reason };
      }
    }

    // 5. Destructive Shell Command Defense in Act Mode
    if (action === "execute_command" || action === "install_dependency") {
      const cmdStr = typeof (input as any)?.command === "string"
        ? (input as any).command
        : "";
      const inspection = this.commandGuard.inspect(cmdStr, mode);
      if (!inspection.safe) {
        const reason = inspection.reason || "Command blocked by security policy.";
        this.logger.error(`Command blocked for session ${sessionId}: ${reason}`);
        await this.auditLogger.log({
          sessionId,
          agentId: request.agentId,
          toolName,
          action,
          risk: inspection.risk,
          decision: "denied_by_policy",
          target: cmdStr,
          reason,
        });
        return { approved: false, reason };
      }
    }

    // 6. Auto-approval for safe read-only operations
    const isReadOnly = risk === "read_only" || risk === "low";
    if (isReadOnly) {
      await this.auditLogger.log({
        sessionId,
        agentId: request.agentId,
        toolName,
        action,
        risk,
        decision: "allowed_auto",
        target: extractedPaths[0],
      });
      return { approved: true };
    }

    // 7. Privileged/Mutating operations require one-shot user approval
    await this.auditLogger.log({
      sessionId,
      agentId: request.agentId,
      toolName,
      action,
      risk,
      decision: "approval_requested",
      target: extractedPaths[0] || (input as any)?.command,
    });

    const approvalResult = await this.approvalCoordinator.requestApproval({
      request,
      action,
      risk,
      workspace: workspaceRoot,
    });

    const finalDecision = approvalResult.approved
      ? "approved_by_user"
      : approvalResult.reason?.includes("timed out")
      ? "timed_out"
      : "rejected_by_user";

    await this.auditLogger.log({
      sessionId,
      agentId: request.agentId,
      toolName,
      action,
      risk,
      decision: finalDecision,
      target: extractedPaths[0] || (input as any)?.command,
      reason: approvalResult.reason,
    });

    return approvalResult;
  }
}
