import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { PermissionManager, SessionContextProvider } from "../permissions/permission-manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { CommandGuard } from "../security/command-guard";
import { AuditLogger } from "../security/audit-logger";
import { Logger } from "../utils/logger";
import type { ToolApprovalRequest } from "@cline/shared";

describe("PermissionManager Security Boundary", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let auditLogFile: string;
  let approvalCoordinator: ApprovalCoordinator;
  let auditLogger: AuditLogger;
  let permissionManager: PermissionManager;
  let currentMode: "plan" | "act" = "act";

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-perm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    auditLogFile = path.join(tempDir, "audit.jsonl");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // Dummy test file
    await fs.writeFile(path.join(workspaceRoot, "code.ts"), "export const x = 42;");

    const logger = new Logger("test-permission");
    approvalCoordinator = new ApprovalCoordinator(logger, 2000);
    auditLogger = new AuditLogger({ logFilePath: auditLogFile });

    const sessionProvider: SessionContextProvider = {
      getSessionWorkspace: () => workspaceRoot,
      getSessionMode: () => currentMode,
    };

    permissionManager = new PermissionManager({
      logger,
      approvalCoordinator,
      pathValidator: new PathValidator(),
      commandGuard: new CommandGuard(),
      auditLogger,
      sessionContextProvider: sessionProvider,
    });
  });

  afterEach(async () => {
    approvalCoordinator.abortAll();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("classifies tool calls accurately into granular actions and risk levels", () => {
    // 1. Read files
    expect(permissionManager.classifyTool("read_files", { path: "code.ts" })).toEqual({
      action: "read_file",
      risk: "read_only",
    });

    // 2. Search codebase
    expect(permissionManager.classifyTool("search_codebase", { query: "x" })).toEqual({
      action: "search_files",
      risk: "read_only",
    });

    // 3. List directory
    expect(permissionManager.classifyTool("list_directory", { path: "." })).toEqual({
      action: "list_directory",
      risk: "read_only",
    });

    // 4. Editor create
    expect(permissionManager.classifyTool("editor", { command: "create", path: "new.ts" })).toEqual({
      action: "create_file",
      risk: "moderate",
    });

    // 5. Editor modify / replace
    expect(permissionManager.classifyTool("editor", { command: "replace", path: "code.ts" })).toEqual({
      action: "modify_file",
      risk: "moderate",
    });

    // 6. Editor delete
    expect(permissionManager.classifyTool("editor", { command: "delete", path: "code.ts" })).toEqual({
      action: "delete_file",
      risk: "high",
    });

    // 7. Apply patch
    expect(permissionManager.classifyTool("apply_patch", { patch: "..." })).toEqual({
      action: "modify_file",
      risk: "moderate",
    });

    // 8. Delete file
    expect(permissionManager.classifyTool("delete_file", { path: "code.ts" })).toEqual({
      action: "delete_file",
      risk: "high",
    });

    // 9. Execute command (normal shell)
    expect(permissionManager.classifyTool("run_commands", { command: "git status" })).toEqual({
      action: "execute_command",
      risk: "high",
    });

    // 10. Install dependency
    expect(permissionManager.classifyTool("run_commands", { command: "npm install lodash" })).toEqual({
      action: "install_dependency",
      risk: "high",
    });

    // 11. Destructive command
    expect(permissionManager.classifyTool("run_commands", { command: "rm -rf /" })).toEqual({
      action: "execute_command",
      risk: "critical",
    });

    // 12. Web fetch
    expect(permissionManager.classifyTool("fetch_web_content", { url: "https://example.com" })).toEqual({
      action: "access_network",
      risk: "high",
    });

    // 13. Unknown tool
    expect(permissionManager.classifyTool("arbitrary_unknown_tool", {})).toEqual({
      action: "unknown",
      risk: "critical",
    });
  });

  it("denies unknown operations by default with clear policy reason", async () => {
    const req: ToolApprovalRequest = {
      sessionId: "session-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      iteration: 1,
      toolCallId: "call-unknown",
      toolName: "unregistered_malicious_plugin",
      input: { foo: "bar" },
      policy: { enabled: true },
    };

    const result = await permissionManager.handleToolApprovalRequest(req);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("Unknown operations are denied by default");

    const recentLogs = await auditLogger.readRecentEntries(10);
    expect(recentLogs.some((l) => l.decision === "denied_by_policy" && l.action === "unknown")).toBe(true);
  });

  it("strictly enforces Plan Mode: allows read-only and denies all mutating tools and commands", async () => {
    currentMode = "plan";

    // 1. Read-only operation in Plan mode is permitted
    const readReq: ToolApprovalRequest = {
      sessionId: "session-plan",
      agentId: "agent-1",
      conversationId: "conv-plan",
      iteration: 1,
      toolCallId: "call-read",
      toolName: "read_files",
      input: { path: "code.ts" },
      policy: { enabled: true },
    };
    const readResult = await permissionManager.handleToolApprovalRequest(readReq);
    expect(readResult.approved).toBe(true);

    // 2. Editor create in Plan mode is immediately blocked
    const createReq: ToolApprovalRequest = {
      sessionId: "session-plan",
      agentId: "agent-1",
      conversationId: "conv-plan",
      iteration: 2,
      toolCallId: "call-create",
      toolName: "editor",
      input: { command: "create", path: "src/new.ts" },
      policy: { enabled: true },
    };
    const createResult = await permissionManager.handleToolApprovalRequest(createReq);
    expect(createResult.approved).toBe(false);
    expect(createResult.reason).toContain("mutating operations (create_file) are prohibited in Plan Mode");

    // 3. Shell command modifying files in Plan mode is immediately blocked
    const mutateShellReq: ToolApprovalRequest = {
      sessionId: "session-plan",
      agentId: "agent-1",
      conversationId: "conv-plan",
      iteration: 3,
      toolCallId: "call-shell",
      toolName: "run_commands",
      input: { command: "echo 'data' > output.txt" },
      policy: { enabled: true },
    };
    const shellResult = await permissionManager.handleToolApprovalRequest(mutateShellReq);
    expect(shellResult.approved).toBe(false);
    expect(shellResult.reason).toContain("prohibited in Plan Mode");
  });

  it("auto-approves safe read-only operations in Act Mode", async () => {
    currentMode = "act";

    const req: ToolApprovalRequest = {
      sessionId: "session-act",
      agentId: "agent-1",
      conversationId: "conv-act",
      iteration: 1,
      toolCallId: "call-search",
      toolName: "search_codebase",
      input: { query: "x" },
      policy: { enabled: true },
    };

    const res = await permissionManager.handleToolApprovalRequest(req);
    expect(res.approved).toBe(true);

    const logs = await auditLogger.readRecentEntries(10);
    expect(logs.some((l) => l.decision === "allowed_auto" && l.action === "search_files")).toBe(true);
  });

  it("blocks path escapes before seeking user approval", async () => {
    currentMode = "act";

    const req: ToolApprovalRequest = {
      sessionId: "session-act",
      agentId: "agent-1",
      conversationId: "conv-act",
      iteration: 2,
      toolCallId: "call-edit-escape",
      toolName: "editor",
      input: { command: "replace", path: "../../escaped.txt" },
      policy: { enabled: true },
    };

    const res = await permissionManager.handleToolApprovalRequest(req);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain("Path security violation");
    expect(approvalCoordinator.getPendingCount()).toBe(0); // Never created pending user prompt!
  });

  it("holds mutating tools in Act Mode for one-shot user approval", async () => {
    currentMode = "act";

    let capturedApprovalId = "";
    approvalCoordinator.setNotifier((notif) => {
      capturedApprovalId = notif.approvalId;
      expect(notif.toolName).toBe("editor");
      expect(notif.action).toBe("modify_file");
      expect(notif.risk).toBe("moderate");
      expect(notif.argumentsHash.length).toBe(64); // SHA-256
    });

    const req: ToolApprovalRequest = {
      sessionId: "session-act",
      agentId: "agent-1",
      conversationId: "conv-act",
      iteration: 3,
      toolCallId: "call-modify",
      toolName: "editor",
      input: { command: "replace", path: "code.ts" },
      policy: { enabled: true },
    };

    const approvalPromise = permissionManager.handleToolApprovalRequest(req);

    // Wait a tick for notifier to fire
    await new Promise((r) => setTimeout(r, 20));
    expect(capturedApprovalId).toBeTruthy();

    // User approves
    approvalCoordinator.resolveApproval(capturedApprovalId, true);

    const res = await approvalPromise;
    expect(res.approved).toBe(true);

    const logs = await auditLogger.readRecentEntries(10);
    expect(logs.some((l) => l.decision === "approved_by_user")).toBe(true);
  });
});
