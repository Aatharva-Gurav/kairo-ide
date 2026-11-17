import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FileSystemToolCoordinator } from "../tools";
import { PermissionManager } from "../permissions/permission-manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { AuditLogger } from "../security/audit-logger";
import { Logger } from "../utils/logger";

describe("FileSystemToolCoordinator", () => {
  let tempDir: string;
  let logger: Logger;
  let approvalCoordinator: ApprovalCoordinator;
  let permissionManager: PermissionManager;
  let toolCoordinator: FileSystemToolCoordinator;
  let currentMode: "plan" | "act" = "act";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairo-fs-tool-test-"));
    logger = new Logger("test-fs-tool");
    approvalCoordinator = new ApprovalCoordinator(logger, 2000);
    // Auto-approve requests during tests
    approvalCoordinator.setNotifier((payload) => {
      approvalCoordinator.resolveApproval(payload.approvalId, true, undefined, payload.sessionId);
    });

    const auditLogger = new AuditLogger({ logFilePath: path.join(tempDir, "audit.jsonl") });
    permissionManager = new PermissionManager({
      logger,
      approvalCoordinator,
      pathValidator: new PathValidator(),
      auditLogger,
      sessionContextProvider: {
        getSessionWorkspace: () => tempDir,
        getSessionMode: () => currentMode,
      },
    });

    toolCoordinator = new FileSystemToolCoordinator({
      permissionManager,
      approvalCoordinator,
      logger,
      defaultWorkspaceRoot: tempDir,
    });
    currentMode = "act";
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("lists all available tools with correct read-only descriptors", () => {
    const tools = toolCoordinator.listAvailableTools();
    expect(tools.length).toBe(7);

    const readTool = tools.find((t) => t.name === "read_file");
    expect(readTool?.isReadOnly).toBe(true);

    const writeTool = tools.find((t) => t.name === "write_to_file");
    expect(writeTool?.isReadOnly).toBe(false);
  });

  it("reads files safely within the workspace", async () => {
    const filePath = path.join(tempDir, "sample.txt");
    await fs.writeFile(filePath, "Hello Kairo!", "utf-8");

    const result = (await toolCoordinator.executeTool(
      "read_file",
      { path: "sample.txt" },
      { workspaceRoot: tempDir }
    )) as { content: string; size: number };

    expect(result.content).toBe("Hello Kairo!");
    expect(result.size).toBe(12);
  });

  it("creates a file safely and prevents blind overwrite if file exists", async () => {
    // 1. Create file successfully
    const res = (await toolCoordinator.executeTool(
      "create_file",
      { path: "new-file.txt", content: "initial data" },
      { workspaceRoot: tempDir }
    )) as { success: boolean };
    expect(res.success).toBe(true);

    const content = await fs.readFile(path.join(tempDir, "new-file.txt"), "utf-8");
    expect(content).toBe("initial data");

    // 2. Refuses to overwrite existing file
    expect(
      toolCoordinator.executeTool(
        "create_file",
        { path: "new-file.txt", content: "overwrite" },
        { workspaceRoot: tempDir }
      )
    ).rejects.toThrow("already exists");
  });

  it("modifies file safely and writes updated content", async () => {
    const filePath = path.join(tempDir, "to-edit.txt");
    await fs.writeFile(filePath, "version 1", "utf-8");

    const res = (await toolCoordinator.executeTool(
      "write_to_file",
      { path: "to-edit.txt", content: "version 2" },
      { workspaceRoot: tempDir }
    )) as { success: boolean; bytesWritten: number };

    expect(res.success).toBe(true);
    expect(res.bytesWritten).toBe(9);

    const updated = await fs.readFile(filePath, "utf-8");
    expect(updated).toBe("version 2");
  });

  it("deletes a file safely", async () => {
    const filePath = path.join(tempDir, "to-delete.txt");
    await fs.writeFile(filePath, "goodbye", "utf-8");

    const res = (await toolCoordinator.executeTool(
      "delete_file",
      { path: "to-delete.txt" },
      { workspaceRoot: tempDir }
    )) as { success: boolean };

    expect(res.success).toBe(true);
    const exists = await fs.stat(filePath).catch(() => null);
    expect(exists).toBeNull();
  });

  it("renames/moves a file safely", async () => {
    const oldPath = path.join(tempDir, "old-name.txt");
    await fs.writeFile(oldPath, "rename me", "utf-8");

    const res = (await toolCoordinator.executeTool(
      "rename_file",
      { oldPath: "old-name.txt", newPath: "new-name.txt" },
      { workspaceRoot: tempDir }
    )) as { success: boolean };

    expect(res.success).toBe(true);
    const oldExists = await fs.stat(oldPath).catch(() => null);
    expect(oldExists).toBeNull();

    const newContent = await fs.readFile(path.join(tempDir, "new-name.txt"), "utf-8");
    expect(newContent).toBe("rename me");
  });

  it("enforces Plan Mode boundary: rejects mutating tools", async () => {
    currentMode = "plan";

    expect(
      toolCoordinator.executeTool(
        "write_to_file",
        { path: "blocked.txt", content: "test" },
        { workspaceRoot: tempDir, mode: "plan" }
      )
    ).rejects.toThrow("Plan Mode");
  });

  it("enforces Workspace Path Sandboxing: rejects path traversal", async () => {
    expect(
      toolCoordinator.executeTool(
        "read_file",
        { path: "../../outside.txt" },
        { workspaceRoot: tempDir }
      )
    ).rejects.toThrow("escapes workspace root");
  });
});
