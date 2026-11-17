import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SidecarTerminalManager } from "../terminal";
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
import { FileSystemToolCoordinator } from "../tools";

describe("Safe Agent Terminal and Command Execution (Stage 10)", () => {
  let tempDir: string;
  let logger: Logger;
  let approvalCoordinator: ApprovalCoordinator;
  let permissionManager: PermissionManager;
  let terminalManager: SidecarTerminalManager;
  let currentMode: "plan" | "act" = "act";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairo-agent-term-test-"));
    logger = new Logger("test-agent-term");
    approvalCoordinator = new ApprovalCoordinator(logger, 2000);

    // Auto-approve by default in tests unless specifically testing rejection
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

    terminalManager = new SidecarTerminalManager({
      permissionManager,
      approvalCoordinator,
      logger,
      defaultWorkspaceRoot: tempDir,
      defaultTimeoutMs: 10_000,
    });
    currentMode = "act";
  });

  afterEach(async () => {
    try {
      await terminalManager.stopAll();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Command Parser & Environment Sanitizer", () => {
    it("parses command strings with quotes and arguments into structured components", () => {
      const parsed = parseCommandLine('git commit -m "feat: implement stage 10" --dry-run');
      expect(parsed.executable).toBe("git");
      expect(parsed.args).toEqual(["commit", "-m", "feat: implement stage 10", "--dry-run"]);
      expect(parsed.isKnownDevTool).toBe(true);
      expect(parsed.hasShellOperators).toBe(false);
    });

    it("detects shell operators and chained commands", () => {
      const parsed = parseCommandLine("npm test && echo done");
      expect(parsed.executable).toBe("npm");
      expect(parsed.hasShellOperators).toBe(true);
      expect(parsed.detectedOperators).toContain("&&");
    });

    it("identifies unknown or dangerous executables", () => {
      const parsed = parseCommandLine("custom_exploit_binary.exe --flag");
      expect(parsed.executable).toBe("custom_exploit_binary.exe");
      expect(parsed.isKnownDevTool).toBe(false);
    });

    it("strips sensitive API keys, tokens, and credentials from environment variables", () => {
      const dirtyEnv = {
        PATH: "C:\\Windows\\System32;/usr/bin",
        TEMP: "C:\\Temp",
        ANTHROPIC_API_KEY: "sk-ant-1234567890abcdef",
        OPENAI_API_KEY: "sk-proj-supersecretkey",
        GEMINI_API_KEY: "AIzaSySecretToken",
        APPROVAL_TOKEN: "f00a99186b314afe8f9d1aba7f1b5c9f",
        SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI...",
        KAIRO_VAULT_PASSWORD: "MasterPassword123",
        MY_CUSTOM_FLAG: "true",
      };

      const cleanEnv = createSanitizedEnv({ CUSTOM_VAR: "allowed_value" }, dirtyEnv);

      expect(cleanEnv.PATH).toBeDefined();
      expect(cleanEnv.TEMP).toBeDefined();
      expect(cleanEnv.CUSTOM_VAR).toBe("allowed_value");

      // Verify ZERO sensitive keys exist
      expect(cleanEnv.ANTHROPIC_API_KEY).toBeUndefined();
      expect(cleanEnv.OPENAI_API_KEY).toBeUndefined();
      expect(cleanEnv.GEMINI_API_KEY).toBeUndefined();
      expect(cleanEnv.APPROVAL_TOKEN).toBeUndefined();
      expect(cleanEnv.SUPABASE_KEY).toBeUndefined();
      expect(cleanEnv.KAIRO_VAULT_PASSWORD).toBeUndefined();
    });

    it("wraps terminal outputs with defensive prompt injection markers", () => {
      const wrapped = formatUntrustedOutput(
        "Build succeeded\n1 warning",
        "",
        0,
        "npm run build",
        false
      );

      expect(wrapped).toContain("[COMMAND_OUTPUT: UNTRUSTED EXTERNAL DATA]");
      expect(wrapped).toContain("Command: npm run build");
      expect(wrapped).toContain("Exit Code: 0");
      expect(wrapped).toContain("Build succeeded");
      expect(wrapped).toContain("[END COMMAND_OUTPUT:");
    });
  });

  describe("Security Boundaries & Permission Enforcement", () => {
    it("blocks destructive system commands immediately without execution", async () => {
      await expect(
        terminalManager.executeCommand("rm -rf /", tempDir)
      ).rejects.toThrow(/SecurityException/i);

      await expect(
        terminalManager.executeCommand("format C:", tempDir)
      ).rejects.toThrow(/SecurityException/i);
    });

    it("rejects working directories escaping workspace root", async () => {
      await expect(
        terminalManager.executeCommand("git status", "../../outside_workspace")
      ).rejects.toThrow(/escapes workspace root/i);
    });

    it("prohibits package installation and mutating commands in Plan Mode", async () => {
      currentMode = "plan";

      await expect(
        terminalManager.executeCommand("npm install express", tempDir)
      ).rejects.toThrow(/prohibited in Plan Mode/i);
    });

    it("requires explicit user approval for package installation in Act Mode", async () => {
      currentMode = "act";
      let approvalPrompted = false;

      // Custom approval listener checking exact payload
      approvalCoordinator.setNotifier((payload) => {
        approvalPrompted = true;
        expect(payload.toolName).toBe("execute_command");
        expect(payload.action).toBe("install_dependency");
        approvalCoordinator.resolveApproval(payload.approvalId, true, undefined, payload.sessionId);
      });

      await terminalManager.executeCommand("bun add --help", tempDir);
      expect(approvalPrompted).toBe(true);
    });

    it("denies command execution when user rejects approval", async () => {
      currentMode = "act";

      approvalCoordinator.setNotifier((payload) => {
        // User clicks Reject
        approvalCoordinator.resolveApproval(
          payload.approvalId,
          false,
          "User denied dependency installation",
          payload.sessionId
        );
      });

      await expect(
        terminalManager.executeCommand("npm install express", tempDir)
      ).rejects.toThrow(/denied/i);
    });
  });

  describe("Execution Lifecycle, Timeouts & Cancellation", () => {
    it("executes valid safe commands and captures stdout with exit code 0", async () => {
      const isWin = process.platform === "win32";
      const cmd = isWin ? "cmd.exe /c echo Hello from Kairo" : "echo Hello from Kairo";

      const res = await terminalManager.executeCommand(cmd, tempDir);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("Hello from Kairo");
      expect(res.truncated).toBe(false);
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("enforces timeout on long-running processes and kills the process tree", async () => {
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? "powershell -Command Start-Sleep -Seconds 5"
        : "sleep 5";

      const res = await terminalManager.executeCommand({
        command: cmd,
        cwd: tempDir,
        timeoutMs: 250, // Short timeout
      });

      expect(res.exitCode).toBe(-1);
      expect(res.stderr).toContain("timed out after 250ms");
    });

    it("supports process cancellation via AbortSignal", async () => {
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? "powershell -Command Start-Sleep -Seconds 5"
        : "sleep 5";

      const controller = new AbortController();

      // Trigger abort after 100ms
      setTimeout(() => controller.abort(), 100);

      const res = await terminalManager.executeCommand({
        command: cmd,
        cwd: tempDir,
        timeoutMs: 10_000,
        signal: controller.signal,
      });

      expect(res.exitCode).toBe(-1);
      expect(res.stderr).toContain("cancelled by user");
    });

    it("truncates excessive output when exceeding maxOutputBytes", async () => {
      const isWin = process.platform === "win32";
      // Generate 2000 'X' characters using node
      const cmd = `node -e "process.stdout.write('X'.repeat(2000))"`;

      const res = await terminalManager.executeCommand({
        command: cmd,
        cwd: tempDir,
        maxOutputBytes: 300, // Bound at 300 bytes
      });

      expect(res.truncated).toBe(true);
      expect(res.stdout.length).toBeGreaterThan(0);
      expect(res.stdout).toContain("Output exceeded maximum limit (300 bytes)");
    });

    it("redacts credentials from stdout and stderr", async () => {
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? "cmd.exe /c echo secret token sk-ant-12345678901234567890123456789012"
        : "echo secret token sk-ant-12345678901234567890123456789012";

      const res = await terminalManager.executeCommand(cmd, tempDir);
      expect(res.stdout).not.toContain("sk-ant-12345678901234567890123456789012");
      expect(res.stdout).toContain("[REDACTED_SECRET]");
    });
  });

  describe("Background Processes & Tool Coordinator Integration", () => {
    it("starts a background process, retrieves output, and stops it cleanly", async () => {
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? "powershell -Command Start-Sleep -Seconds 10"
        : "sleep 10";

      const handle = await terminalManager.executeBackgroundCommand(cmd, tempDir);
      expect(handle.executionId).toBeDefined();
      expect(handle.processId).toBeGreaterThan(0);

      const runningList = await terminalManager.listRunningProcesses();
      expect(runningList.some((p) => p.executionId === handle.executionId)).toBe(true);

      const status = await terminalManager.getCommandOutput(handle.executionId);
      expect(status.status).toBe("running");

      const stopped = await terminalManager.stopProcess(handle.executionId);
      expect(stopped).toBe(true);

      const afterStop = await terminalManager.getCommandOutput(handle.executionId);
      expect(afterStop.status).toBe("killed");
    });

    it("integrates with FileSystemToolCoordinator for execute_command tool", async () => {
      const toolCoordinator = new FileSystemToolCoordinator({
        permissionManager,
        approvalCoordinator,
        logger,
        defaultWorkspaceRoot: tempDir,
        terminalManager,
      });

      const isWin = process.platform === "win32";
      const cmd = isWin ? "cmd.exe /c echo Tool execution test" : "echo Tool execution test";

      const res = (await toolCoordinator.executeTool(
        "execute_command",
        { command: cmd },
        { workspaceRoot: tempDir }
      )) as { exitCode: number; stdout: string; formattedOutput: string };

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("Tool execution test");
      expect(res.formattedOutput).toContain("[COMMAND_OUTPUT: UNTRUSTED EXTERNAL DATA]");
    });
  });
});
