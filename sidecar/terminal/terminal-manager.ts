/**
 * Dedicated Agent Terminal Manager for Kairo AI Agent sidecar.
 *
 * Implements non-interactive headless command execution with:
 * - Working-directory sandboxing within workspace root.
 * - Zero-secret environment variable sanitization.
 * - PermissionManager and ApprovalCoordinator integration.
 * - Process tree termination on timeout or cancellation.
 * - Bounded buffer output capture (1 MB limit).
 * - Secret redaction on stdout and stderr.
 * - Untrusted external data boundary tags.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import {
  ITerminalManager,
  CommandExecutionResult,
  BackgroundProcessHandle,
  ProcessStatusSnapshot,
  ExecuteCommandOptions,
} from "./index";
import { PermissionManager } from "../permissions/permission-manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { AuditLogger } from "../security/audit-logger";
import { Logger } from "../utils/logger";
import {
  parseCommandLine,
  createSanitizedEnv,
  formatUntrustedOutput,
} from "../security/command-parser";
import { redactSecrets } from "../utils/redaction";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

interface TrackedBackgroundProcess {
  handle: BackgroundProcessHandle;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  status: "running" | "completed" | "timed_out" | "killed" | "failed";
  exitCode?: number;
  totalBytes: number;
  truncated: boolean;
  maxOutputBytes: number;
}

export interface SidecarTerminalManagerOptions {
  permissionManager: PermissionManager;
  approvalCoordinator: ApprovalCoordinator;
  pathValidator?: PathValidator;
  auditLogger?: AuditLogger;
  logger: Logger;
  defaultWorkspaceRoot?: string;
  defaultTimeoutMs?: number;
  defaultMaxOutputBytes?: number;
}

export class SidecarTerminalManager implements ITerminalManager {
  private readonly permissionManager: PermissionManager;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly pathValidator: PathValidator;
  private readonly auditLogger?: AuditLogger;
  private readonly logger: Logger;
  private readonly defaultWorkspaceRoot: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxOutputBytes: number;

  private readonly trackedProcesses = new Map<string, TrackedBackgroundProcess>();

  constructor(options: SidecarTerminalManagerOptions) {
    this.permissionManager = options.permissionManager;
    this.approvalCoordinator = options.approvalCoordinator;
    this.pathValidator = options.pathValidator ?? options.permissionManager.getPathValidator();
    this.auditLogger = options.auditLogger;
    this.logger = options.logger.child("terminal-manager");
    this.defaultWorkspaceRoot = options.defaultWorkspaceRoot || process.cwd();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMaxOutputBytes = options.defaultMaxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  }

  /**
   * Normalizes options whether passed as a string or ExecuteCommandOptions.
   */
  private normalizeOptions(
    cmdOrOptions: ExecuteCommandOptions | string,
    cwd?: string,
    timeoutMs?: number,
    maxOutputBytes?: number
  ): ExecuteCommandOptions {
    if (typeof cmdOrOptions === "string") {
      return {
        command: cmdOrOptions,
        cwd,
        timeoutMs,
        maxOutputBytes,
      };
    }
    return {
      ...cmdOrOptions,
      cwd: cmdOrOptions.cwd || cwd,
      timeoutMs: cmdOrOptions.timeoutMs || timeoutMs,
      maxOutputBytes: cmdOrOptions.maxOutputBytes || maxOutputBytes,
    };
  }

  /**
   * Validates working directory and returns the canonical absolute path.
   */
  private resolveAndValidateCwd(requestedCwd?: string, workspaceRoot?: string): string {
    const wsRoot = workspaceRoot || this.defaultWorkspaceRoot;
    const resolved = requestedCwd
      ? path.isAbsolute(requestedCwd)
        ? path.resolve(requestedCwd)
        : path.resolve(wsRoot, requestedCwd)
      : wsRoot;

    // Check workspace containment
    const val = this.pathValidator.validate(resolved, wsRoot, { allowReadSensitive: true });
    if (!val.valid || !val.canonicalPath) {
      throw new Error(
        `Working directory security violation: path "${resolved}" escapes workspace root "${wsRoot}".`
      );
    }

    return val.canonicalPath;
  }

  /**
   * Safely terminates a process and its child process tree.
   */
  public killProcessTree(pid: number): void {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        // Unix: kill process group
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          process.kill(pid, "SIGKILL");
        }
      }
    } catch {
      // Process may already be dead
    }
  }

  /**
   * Executes a command synchronously with security verification, timeout, and output bounds.
   */
  public async executeCommand(
    cmdOrOptions: ExecuteCommandOptions | string,
    cwd?: string,
    timeoutMs?: number,
    maxOutputBytes?: number
  ): Promise<CommandExecutionResult> {
    const opts = this.normalizeOptions(cmdOrOptions, cwd, timeoutMs, maxOutputBytes);
    const commandStr = (opts.command || "").trim();
    if (!commandStr) {
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        executionTimeMs: 0,
        truncated: false,
      };
    }

    const sessionId = opts.sessionId || "default-session";
    const workspaceRoot = opts.workspaceRoot || this.defaultWorkspaceRoot;
    const effectiveCwd = this.resolveAndValidateCwd(opts.cwd, workspaceRoot);

    // 1. Parse command and arguments
    const parsed = parseCommandLine(commandStr);

    // 2. Security validation through PermissionManager
    const permResult = await this.permissionManager.checkPermission({
      sessionId,
      toolName: "execute_command",
      toolInput: {
        command: commandStr,
        executable: parsed.executable,
        args: parsed.args,
        cwd: effectiveCwd,
      },
    });

    if (!permResult.allowed) {
      this.logger.warn(`Execution denied for command: "${commandStr}": ${permResult.reason}`);
      this.auditLogger?.log({
        sessionId,
        toolName: "execute_command",
        action: "execute_command",
        target: commandStr,
        risk: permResult.risk,
        decision: "denied_by_policy",
        reason: permResult.reason,
      });
      throw new Error(`[SecurityException] Execution denied: ${permResult.reason}`);
    }

    // 3. Prepare sanitized environment (Zero Secret Inheritance)
    const sanitizedEnv = createSanitizedEnv(opts.env);

    const maxBytes = opts.maxOutputBytes ?? this.defaultMaxOutputBytes;
    const timeout = opts.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();

    return new Promise<CommandExecutionResult>((resolve, reject) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let totalBytes = 0;
      let truncated = false;
      let timedOut = false;
      let killed = false;

      // Resolve Windows batch/cmd wrappers and builtins
      let execToRun = parsed.executable;
      if (process.platform === "win32") {
        const lower = execToRun.toLowerCase();
        if (["npm", "pnpm", "yarn", "npx", "pnpx", "bunx"].includes(lower)) {
          execToRun = `${execToRun}.cmd`;
        }
      }

      const WIN_CMD_BUILTINS = new Set(["echo", "dir", "cd", "type", "copy", "del", "cls", "ver"]);
      const shouldUseShell =
        parsed.hasShellOperators ||
        (process.platform === "win32" && WIN_CMD_BUILTINS.has(parsed.executable.toLowerCase()));

      let child: ChildProcess;
      try {
        if (!shouldUseShell && execToRun) {
          child = spawn(execToRun, parsed.args, {
            cwd: effectiveCwd,
            env: sanitizedEnv,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } else {
          // Fallback to platform shell when shell operators or built-ins are present
          const shellExec = process.platform === "win32" ? "cmd.exe" : "sh";
          const shellArgs =
            process.platform === "win32"
              ? ["/d", "/s", "/c", commandStr]
              : ["-c", commandStr];

          child = spawn(shellExec, shellArgs, {
            cwd: effectiveCwd,
            env: sanitizedEnv,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
        }
      } catch (err) {
        return reject(
          new Error(`Failed to spawn command "${commandStr}": ${String(err)}`)
        );
      }

      const pid = child.pid;

      // Timeout timer
      const timer = setTimeout(() => {
        timedOut = true;
        if (pid) {
          this.killProcessTree(pid);
        }
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, timeout);

      // Abort signal listener
      let abortHandler: (() => void) | undefined;
      if (opts.signal) {
        abortHandler = () => {
          killed = true;
          clearTimeout(timer);
          if (pid) {
            this.killProcessTree(pid);
          }
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        };
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }

      // Stream stdout
      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const byteLen = Buffer.byteLength(text, "utf-8");
        if (totalBytes < maxBytes) {
          const remaining = maxBytes - totalBytes;
          if (byteLen <= remaining) {
            stdoutBuf += text;
            totalBytes += byteLen;
          } else {
            stdoutBuf += text.slice(0, remaining);
            totalBytes = maxBytes;
            truncated = true;
          }
        } else {
          truncated = true;
        }
      });

      // Stream stderr
      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const byteLen = Buffer.byteLength(text, "utf-8");
        if (totalBytes < maxBytes) {
          const remaining = maxBytes - totalBytes;
          if (byteLen <= remaining) {
            stderrBuf += text;
            totalBytes += byteLen;
          } else {
            stderrBuf += text.slice(0, remaining);
            totalBytes = maxBytes;
            truncated = true;
          }
        } else {
          truncated = true;
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        if (abortHandler && opts.signal) {
          opts.signal.removeEventListener("abort", abortHandler);
        }
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (abortHandler && opts.signal) {
          opts.signal.removeEventListener("abort", abortHandler);
        }

        const executionTimeMs = Date.now() - startTime;
        let finalExitCode = code !== null ? code : -1;

        if (timedOut) {
          finalExitCode = -1;
          stderrBuf += `\n[Kairo AI Security] Command timed out after ${timeout}ms and was terminated.`;
        } else if (killed) {
          finalExitCode = -1;
          stderrBuf += "\n[Kairo AI Security] Command execution was cancelled by user.";
        }

        if (truncated) {
          stdoutBuf += `\n[Kairo AI Security] Output exceeded maximum limit (${maxBytes} bytes). Output truncated.`;
        }

        const result: CommandExecutionResult = {
          exitCode: finalExitCode,
          stdout: redactSecrets(stdoutBuf),
          stderr: redactSecrets(stderrBuf),
          executionTimeMs,
          truncated,
        };

        this.auditLogger?.log({
          sessionId,
          toolName: "execute_command",
          action: "execute_command",
          target: commandStr,
          risk: permResult.risk,
          decision: "approved_by_user",
          reason: `Exit code: ${finalExitCode}, duration: ${executionTimeMs}ms`,
        });

        resolve(result);
      });
    });
  }

  /**
   * Spawns a background command and tracks its lifecycle.
   */
  public async executeBackgroundCommand(
    cmdOrOptions: ExecuteCommandOptions | string,
    cwd?: string,
    maxOutputBytes?: number
  ): Promise<BackgroundProcessHandle> {
    const opts = this.normalizeOptions(cmdOrOptions, cwd, undefined, maxOutputBytes);
    const commandStr = (opts.command || "").trim();
    if (!commandStr) {
      throw new Error("Cannot spawn background process with empty command string.");
    }

    const sessionId = opts.sessionId || "default-session";
    const workspaceRoot = opts.workspaceRoot || this.defaultWorkspaceRoot;
    const effectiveCwd = this.resolveAndValidateCwd(opts.cwd, workspaceRoot);

    const parsed = parseCommandLine(commandStr);

    const permResult = await this.permissionManager.checkPermission({
      sessionId,
      toolName: "execute_command",
      toolInput: {
        command: commandStr,
        executable: parsed.executable,
        args: parsed.args,
        cwd: effectiveCwd,
        isBackground: true,
      },
    });

    if (!permResult.allowed) {
      this.logger.warn(`Background execution denied for "${commandStr}": ${permResult.reason}`);
      throw new Error(`[SecurityException] Background execution denied: ${permResult.reason}`);
    }

    const sanitizedEnv = createSanitizedEnv(opts.env);
    const maxBytes = opts.maxOutputBytes ?? this.defaultMaxOutputBytes;

    let execToRun = parsed.executable;
    if (process.platform === "win32") {
      const lower = execToRun.toLowerCase();
      if (["npm", "pnpm", "yarn", "npx", "pnpx", "bunx"].includes(lower)) {
        execToRun = `${execToRun}.cmd`;
      }
    }

    const WIN_CMD_BUILTINS = new Set(["echo", "dir", "cd", "type", "copy", "del", "cls", "ver"]);
    const shouldUseShell =
      parsed.hasShellOperators ||
      (process.platform === "win32" && WIN_CMD_BUILTINS.has(parsed.executable.toLowerCase()));

    let child: ChildProcess;
    if (!shouldUseShell && execToRun) {
      child = spawn(execToRun, parsed.args, {
        cwd: effectiveCwd,
        env: sanitizedEnv,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      const shellExec = process.platform === "win32" ? "cmd.exe" : "sh";
      const shellArgs =
        process.platform === "win32"
          ? ["/d", "/s", "/c", commandStr]
          : ["-c", commandStr];

      child = spawn(shellExec, shellArgs, {
        cwd: effectiveCwd,
        env: sanitizedEnv,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    const executionId = `bg_proc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const pid = child.pid || 0;
    const startedAt = Date.now();

    const handle: BackgroundProcessHandle = {
      processId: pid,
      executionId,
      command: commandStr,
      cwd: effectiveCwd,
      startedAt,
    };

    const tracked: TrackedBackgroundProcess = {
      handle,
      child,
      stdout: "",
      stderr: "",
      status: "running",
      totalBytes: 0,
      truncated: false,
      maxOutputBytes: maxBytes,
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const byteLen = Buffer.byteLength(text, "utf-8");
      if (tracked.totalBytes < maxBytes) {
        const remaining = maxBytes - tracked.totalBytes;
        if (byteLen <= remaining) {
          tracked.stdout += text;
          tracked.totalBytes += byteLen;
        } else {
          tracked.stdout += text.slice(0, remaining);
          tracked.totalBytes = maxBytes;
          tracked.truncated = true;
        }
      } else {
        tracked.truncated = true;
      }
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const byteLen = Buffer.byteLength(text, "utf-8");
      if (tracked.totalBytes < maxBytes) {
        const remaining = maxBytes - tracked.totalBytes;
        if (byteLen <= remaining) {
          tracked.stderr += text;
          tracked.totalBytes += byteLen;
        } else {
          tracked.stderr += text.slice(0, remaining);
          tracked.totalBytes = maxBytes;
          tracked.truncated = true;
        }
      } else {
        tracked.truncated = true;
      }
    });

    child.on("close", (code) => {
      tracked.status = code === 0 ? "completed" : "failed";
      tracked.exitCode = code !== null ? code : -1;
    });

    child.on("error", () => {
      tracked.status = "failed";
      tracked.exitCode = -1;
    });

    this.trackedProcesses.set(executionId, tracked);
    return handle;
  }

  /**
   * Retrieves buffered output and current status for a background process.
   */
  public async getCommandOutput(executionId: string): Promise<ProcessStatusSnapshot> {
    const tracked = this.trackedProcesses.get(executionId);
    if (!tracked) {
      throw new Error(`Background process "${executionId}" not found.`);
    }

    return {
      executionId,
      status: tracked.status,
      exitCode: tracked.exitCode,
      stdout: redactSecrets(tracked.stdout),
      stderr: redactSecrets(tracked.stderr),
    };
  }

  /**
   * Lists all running tracked background processes.
   */
  public async listRunningProcesses(): Promise<BackgroundProcessHandle[]> {
    const list: BackgroundProcessHandle[] = [];
    for (const tracked of this.trackedProcesses.values()) {
      if (tracked.status === "running") {
        list.push({ ...tracked.handle });
      }
    }
    return list;
  }

  /**
   * Stops an active background process.
   */
  public async stopProcess(executionId: string): Promise<boolean> {
    const tracked = this.trackedProcesses.get(executionId);
    if (!tracked) {
      return false;
    }

    tracked.status = "killed";
    if (tracked.child.pid) {
      this.killProcessTree(tracked.child.pid);
    }
    try {
      tracked.child.kill("SIGKILL");
    } catch {
      // ignore
    }
    return true;
  }

  /**
   * Stops all active background processes.
   */
  public async stopAll(): Promise<void> {
    for (const executionId of this.trackedProcesses.keys()) {
      await this.stopProcess(executionId);
    }
  }
}
