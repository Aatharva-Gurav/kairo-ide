/**
 * Tool execution coordinator and concrete Filesystem Tools for Kairo AI Agent sidecar.
 * Integrates directly with PermissionManager, PathValidator, and ApprovalCoordinator.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PermissionManager } from "../permissions/permission-manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { Logger } from "../utils/logger";

export interface ToolDefinition {
  name: string;
  description: string;
  isReadOnly: boolean;
}

export interface ToolExecutionContext {
  sessionId?: string;
  taskId?: string;
  workspaceRoot?: string;
  mode?: "plan" | "act";
}

export interface IToolCoordinator {
  listAvailableTools(): ToolDefinition[];
  executeTool(
    name: string,
    args: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<unknown>;
}

export interface FileSystemToolCoordinatorOptions {
  permissionManager: PermissionManager;
  approvalCoordinator: ApprovalCoordinator;
  pathValidator?: PathValidator;
  logger: Logger;
  defaultWorkspaceRoot?: string;
}

export class FileSystemToolCoordinator implements IToolCoordinator {
  private readonly permissionManager: PermissionManager;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly pathValidator: PathValidator;
  private readonly logger: Logger;
  private readonly defaultWorkspaceRoot: string;

  constructor(options: FileSystemToolCoordinatorOptions) {
    this.permissionManager = options.permissionManager;
    this.approvalCoordinator = options.approvalCoordinator;
    this.pathValidator = options.pathValidator ?? options.permissionManager.getPathValidator();
    this.logger = options.logger.child("filesystem-tools");
    this.defaultWorkspaceRoot = options.defaultWorkspaceRoot || process.cwd();
  }

  public listAvailableTools(): ToolDefinition[] {
    return [
      {
        name: "read_file",
        description: "Safely reads the contents of a file within the workspace.",
        isReadOnly: true,
      },
      {
        name: "write_to_file",
        description: "Safely writes or modifies file content within the workspace.",
        isReadOnly: false,
      },
      {
        name: "create_file",
        description: "Safely creates a new file within the workspace if it does not already exist.",
        isReadOnly: false,
      },
      {
        name: "delete_file",
        description: "Safely removes a file within the workspace after approval.",
        isReadOnly: false,
      },
      {
        name: "rename_file",
        description: "Safely renames or moves a file within the workspace after approval.",
        isReadOnly: false,
      },
      {
        name: "list_directory",
        description: "Lists directory entries within the workspace.",
        isReadOnly: true,
      },
      {
        name: "search_files",
        description: "Searches for files matching a pattern within the workspace.",
        isReadOnly: true,
      },
    ];
  }

  public async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext = {}
  ): Promise<unknown> {
    const normName = name.toLowerCase();
    const workspaceRoot = context.workspaceRoot || this.defaultWorkspaceRoot;
    const mode = context.mode || "act";
    const sessionId = context.sessionId || "default-session";

    this.logger.info(`Executing tool '${name}' (session=${sessionId}, mode=${mode})`);

    // 1. Permission Manager Classification & Governance
    const approvalResult = await this.permissionManager.handleToolApprovalRequest({
      sessionId,
      agentId: "lead-agent",
      conversationId: context.taskId || sessionId,
      iteration: 1,
      toolCallId: `call_${Date.now()}`,
      toolName: name,
      input: args,
      policy: { enabled: true },
    });

    if (!approvalResult.approved) {
      this.logger.warn(`Tool '${name}' was rejected: ${approvalResult.reason}`);
      throw new Error(approvalResult.reason || `Tool execution rejected for '${name}'`);
    }

    // 2. Dispatch to specific tool handler
    if (normName === "read_file" || normName === "read_files" || normName === "readfile") {
      return this.handleReadFile(args, workspaceRoot);
    }

    if (normName === "write_to_file" || normName === "edit_file" || normName === "editfile") {
      return this.handleWriteFile(args, workspaceRoot);
    }

    if (normName === "create_file" || normName === "createfile") {
      return this.handleCreateFile(args, workspaceRoot);
    }

    if (normName === "delete_file" || normName === "deletefile") {
      return this.handleDeleteFile(args, workspaceRoot);
    }

    if (normName === "rename_file" || normName === "move_file" || normName === "renamefile" || normName === "movefile") {
      return this.handleRenameFile(args, workspaceRoot);
    }

    if (normName === "list_directory" || normName === "list_files" || normName === "listdirectory") {
      return this.handleListDirectory(args, workspaceRoot);
    }

    if (normName === "search_files" || normName === "search_codebase" || normName === "searchfiles") {
      return this.handleSearchFiles(args, workspaceRoot);
    }

    throw new Error(`Unsupported tool: '${name}'`);
  }

  private resolveValidPath(targetPath: string, workspaceRoot: string): string {
    const val = this.pathValidator.validate(targetPath, workspaceRoot);
    if (!val.valid || !val.canonicalPath) {
      throw new Error(`Path security violation for '${targetPath}': ${val.error}`);
    }
    return val.canonicalPath;
  }

  private async handleReadFile(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ path: string; content: string; size: number }> {
    const rawPath = String(args.path || args.filePath || args.targetPath || "");
    const canonical = this.resolveValidPath(rawPath, workspaceRoot);

    try {
      const content = await fs.readFile(canonical, "utf-8");
      return {
        path: canonical,
        content,
        size: Buffer.byteLength(content, "utf-8"),
      };
    } catch (err: unknown) {
      throw new Error(`Failed to read file '${rawPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleWriteFile(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ path: string; success: boolean; bytesWritten: number }> {
    const rawPath = String(args.path || args.filePath || args.targetPath || "");
    const content = String(args.content ?? args.newContent ?? "");
    const canonical = this.resolveValidPath(rawPath, workspaceRoot);

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(canonical), { recursive: true });
      await fs.writeFile(canonical, content, "utf-8");
      return {
        path: canonical,
        success: true,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };
    } catch (err: unknown) {
      throw new Error(`Failed to write file '${rawPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleCreateFile(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ path: string; success: boolean }> {
    const rawPath = String(args.path || args.filePath || args.targetPath || "");
    const content = String(args.content ?? "");
    const canonical = this.resolveValidPath(rawPath, workspaceRoot);

    try {
      // Fail if file already exists
      const exists = await fs.stat(canonical).then(() => true).catch(() => false);
      if (exists) {
        throw new Error(`File '${rawPath}' already exists. Refusing blind overwrite.`);
      }

      await fs.mkdir(path.dirname(canonical), { recursive: true });
      await fs.writeFile(canonical, content, "utf-8");
      return { path: canonical, success: true };
    } catch (err: unknown) {
      throw new Error(`Failed to create file '${rawPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleDeleteFile(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ path: string; success: boolean }> {
    const rawPath = String(args.path || args.filePath || args.targetPath || "");
    const canonical = this.resolveValidPath(rawPath, workspaceRoot);

    try {
      await fs.unlink(canonical);
      return { path: canonical, success: true };
    } catch (err: unknown) {
      throw new Error(`Failed to delete file '${rawPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleRenameFile(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ oldPath: string; newPath: string; success: boolean }> {
    const oldRaw = String(args.oldPath || args.sourcePath || "");
    const newRaw = String(args.newPath || args.destinationPath || args.targetPath || "");

    const oldCanonical = this.resolveValidPath(oldRaw, workspaceRoot);
    const newCanonical = this.resolveValidPath(newRaw, workspaceRoot);

    try {
      await fs.mkdir(path.dirname(newCanonical), { recursive: true });
      await fs.rename(oldCanonical, newCanonical);
      return { oldPath: oldCanonical, newPath: newCanonical, success: true };
    } catch (err: unknown) {
      throw new Error(`Failed to rename '${oldRaw}' to '${newRaw}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleListDirectory(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ directory: string; entries: Array<{ name: string; isDirectory: boolean }> }> {
    const rawPath = String(args.path || args.directoryPath || ".");
    const canonical = this.resolveValidPath(rawPath, workspaceRoot);

    try {
      const dirents = await fs.readdir(canonical, { withFileTypes: true });
      const entries = dirents.map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
      }));
      return { directory: canonical, entries };
    } catch (err: unknown) {
      throw new Error(`Failed to list directory '${rawPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleSearchFiles(
    args: Record<string, unknown>,
    workspaceRoot: string
  ): Promise<{ matches: string[] }> {
    const query = String(args.query || args.pattern || "").toLowerCase();
    const matches: string[] = [];

    const walk = async (dir: string) => {
      try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
          if (dirent.name === "node_modules" || dirent.name === ".git" || dirent.name === ".next") {
            continue;
          }
          const fullPath = path.join(dir, dirent.name);
          if (dirent.isDirectory()) {
            await walk(fullPath);
          } else if (dirent.isFile() && dirent.name.toLowerCase().includes(query)) {
            matches.push(path.relative(workspaceRoot, fullPath).replace(/\\/g, "/"));
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    };

    await walk(workspaceRoot);
    return { matches };
  }
}
