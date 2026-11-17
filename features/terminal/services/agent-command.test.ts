import { describe, it, expect, beforeEach } from "vitest";
import { AgentCommandService } from "@/features/ai-agent/services/agent-command.service";
import { AiTerminalExecutionAdapter, ApprovalRequester } from "./ai-terminal-adapter";
import { TerminalInstanceRegistry } from "./terminal-instance-registry";

describe("Agent Command Service & Terminal Isolation (Stage 10)", () => {
  beforeEach(() => {
    TerminalInstanceRegistry.disposeAll();
  });

  describe("User Terminal Isolation Guarantee", () => {
    it("executes agent commands headlessly without creating or polluting user terminal instances", async () => {
      // 1. Verify user terminal registry starts empty
      expect(TerminalInstanceRegistry.has("session-1")).toBe(false);

      const service = new AgentCommandService({
        autoTrustSafeCommands: true,
      });

      // 2. Execute agent commands
      const res1 = await service.execute({ command: "git status" });
      const res2 = await service.execute({ command: "echo Hello from Agent" });

      expect(res1.exitCode).toBe(0);
      expect(res2.exitCode).toBe(0);

      // 3. Verify user terminal registry has ZERO instances and was never touched
      expect(TerminalInstanceRegistry.has("session-1")).toBe(false);
      expect(TerminalInstanceRegistry.has("mock-1")).toBe(false);

      // 4. Verify history is recorded separately in agent command service
      const history = service.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].command).toBe("git status");
      expect(history[0].status).toBe("completed");
      expect(history[1].command).toBe("echo Hello from Agent");
      expect(history[1].status).toBe("completed");
    });
  });

  describe("Security Governance & Exact Approval Binding", () => {
    it("blocks destructive system commands without calling approval requester", async () => {
      let requesterCalled = false;
      const service = new AgentCommandService({
        approvalRequester: async () => {
          requesterCalled = true;
          return true;
        },
      });

      await expect(
        service.execute({ command: "rm -rf /" })
      ).rejects.toThrow(/SecurityException.*blocked destructive/i);

      expect(requesterCalled).toBe(false);
    });

    it("binds exact command, executable, arguments, and cwd to user approval requester", async () => {
      let capturedDetails: Parameters<ApprovalRequester>[0] | null = null;
      const service = new AgentCommandService({
        approvalRequester: async (details) => {
          capturedDetails = details;
          return true; // user approves
        },
      });

      await service.execute({
        command: "npm test -- --coverage",
        cwd: "C:/workspace/my-app",
      });

      expect(capturedDetails).toBeDefined();
      const details = capturedDetails as unknown as Parameters<ApprovalRequester>[0];
      expect(details.command).toBe("npm test -- --coverage");
      expect(details.executable).toBe("npm");
      expect(details.args).toEqual(["test", "--", "--coverage"]);
      expect(details.cwd).toBe("C:/workspace/my-app");
    });

    it("detects package installation and flags isPackageInstall: true", async () => {
      let isPackageInstallFlag: boolean | undefined;
      const service = new AgentCommandService({
        approvalRequester: async (details) => {
          isPackageInstallFlag = details.isPackageInstall;
          return true;
        },
      });

      await service.execute({ command: "pnpm add react" });
      expect(isPackageInstallFlag).toBe(true);
    });

    it("detects directories outside workspace root and flags isOutsideWorkspace: true with critical risk", async () => {
      let riskLevel: string | undefined;
      let outsideFlag: boolean | undefined;

      const service = new AgentCommandService({
        approvalRequester: async (details) => {
          riskLevel = details.risk;
          outsideFlag = details.isOutsideWorkspace;
          return true;
        },
      });

      await service.execute({
        command: "git status",
        cwd: "C:/other-drive/escaped",
        workspaceRoot: "C:/workspace/project",
      });

      expect(outsideFlag).toBe(true);
      expect(riskLevel).toBe("critical");
    });

    it("cancels execution immediately when AbortSignal is already aborted", async () => {
      const service = new AgentCommandService();
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.execute({
          command: "git status",
          signal: controller.signal,
        })
      ).rejects.toThrow(/cancelled before start/i);
    });
  });

  describe("Secret Redaction & Untrusted Output Delimitation", () => {
    it("redacts secrets and formats untrusted output delimiters", () => {
      const adapter = new AiTerminalExecutionAdapter();
      const rawStdout = "Config loaded: ghp_123456789012345678901234567890123456";
      const sanitized = adapter.redactSecrets(rawStdout);
      expect(sanitized).not.toContain("ghp_123456789012345678901234567890123456");
      expect(sanitized).toContain("[REDACTED_SECRET]");

      const formatted = adapter.formatUntrustedOutput(
        sanitized,
        "",
        0,
        "npm start",
        false
      );

      expect(formatted).toContain("[COMMAND_OUTPUT: UNTRUSTED EXTERNAL DATA]");
      expect(formatted).toContain("Command: npm start");
      expect(formatted).toContain("[END COMMAND_OUTPUT:");
    });
  });
});
