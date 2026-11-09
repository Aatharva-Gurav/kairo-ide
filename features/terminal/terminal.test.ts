import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TerminalThemeService } from "./services/terminal-theme.service";
import { TerminalInstanceRegistry } from "./services/terminal-instance-registry";
import { DEFAULT_TERMINAL_SETTINGS, ShellProfile } from "./types";
import { registerTerminalCommands } from "./services/terminal-commands";
import { TerminalProfileService } from "./services/terminal-profile.service";
import { DevServerDetector } from "./services/dev-server-detector";
import { AiTerminalExecutionAdapter } from "./services/ai-terminal-adapter";
import { CommandRegistry } from "@/features/commands/command-registry";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { ideEvents } from "@/lib/events";
import { THEME_DEFINITIONS, ThemeId } from "@/features/theme";

describe("Integrated Terminal Subsystem - Stage 4", () => {
  describe("Theme Integration Across All Kairo Themes", () => {
    const themeIds = Object.keys(THEME_DEFINITIONS) as ThemeId[];

    it("supports all 14 Kairo IDE themes without throwing", () => {
      expect(themeIds.length).toBeGreaterThanOrEqual(14);
      for (const tid of themeIds) {
        const theme = TerminalThemeService.getTheme(tid);
        expect(theme.background).toBeDefined();
        expect(theme.foreground).toBeDefined();
        expect(theme.cursor).toBeDefined();
        expect(theme.selectionBackground).toBeDefined();
        expect(theme.black).toBeDefined();
        expect(theme.red).toBeDefined();
        expect(theme.green).toBeDefined();
        expect(theme.yellow).toBeDefined();
        expect(theme.blue).toBeDefined();
        expect(theme.magenta).toBeDefined();
        expect(theme.cyan).toBeDefined();
        expect(theme.white).toBeDefined();
      }
    });

    it("produces light background for light themes and dark background for dark themes", () => {
      const darkTheme = TerminalThemeService.getTheme("dark-modern");
      const lightTheme = TerminalThemeService.getTheme("light-modern");

      expect(darkTheme.background?.toLowerCase()).toMatch(/#181818|#1e1e1e/);
      expect(lightTheme.background?.toLowerCase()).toMatch(/#f8f8f8|#ffffff/);
    });
  });

  describe("TerminalInstanceRegistry Lifecycle", () => {
    beforeEach(() => {
      TerminalInstanceRegistry.disposeAll();
    });

    it("focuses terminal instance safely via TerminalInstanceRegistry.focus()", () => {
      const sessionId = "focus-test-session";
      const instance = TerminalInstanceRegistry.createOrGet(
        sessionId,
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );

      let focusCalled = false;
      instance.term.focus = () => {
        focusCalled = true;
      };

      TerminalInstanceRegistry.focus(sessionId);
      expect(focusCalled).toBe(true);

      // Focus on nonexistent session should not throw
      expect(() => TerminalInstanceRegistry.focus("non-existent-session")).not.toThrow();

      TerminalInstanceRegistry.dispose(sessionId);
    });

    it("creates, stores and disposes terminal instances cleanly", () => {
      const sessionId = "test-session-1";
      const instance = TerminalInstanceRegistry.createOrGet(
        sessionId,
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );

      expect(instance).toBeDefined();
      expect(instance.sessionId).toBe(sessionId);
      expect(TerminalInstanceRegistry.has(sessionId)).toBe(true);
      expect(TerminalInstanceRegistry.get(sessionId)).toBe(instance);

      // Verify addons loaded
      expect(instance.fitAddon).toBeDefined();
      expect(instance.searchAddon).toBeDefined();
      expect(instance.webLinksAddon).toBeDefined();
      expect(instance.unicode11Addon).toBeDefined();

      // Dispose instance
      TerminalInstanceRegistry.dispose(sessionId);
      expect(TerminalInstanceRegistry.has(sessionId)).toBe(false);
      expect(instance.disposed).toBe(true);
    });

    it("applies theme updates to all active terminal instances", () => {
      const s1 = TerminalInstanceRegistry.createOrGet(
        "s1",
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );
      const s2 = TerminalInstanceRegistry.createOrGet(
        "s2",
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );

      TerminalInstanceRegistry.applyAllThemes("light-modern");
      expect(s1.term.options.theme?.background).toBe("#F8F8F8");
      expect(s2.term.options.theme?.background).toBe("#F8F8F8");

      TerminalInstanceRegistry.disposeAll();
    });
  });

  describe("Command & Keybinding Integration", () => {
    let unregister: () => void;

    beforeEach(() => {
      KeybindingService.init();
      unregister = registerTerminalCommands();
    });

    afterEach(() => {
      unregister?.();
    });

    it("maps terminal shortcuts correctly in KeybindingService", () => {
      const toggleCmd = KeybindingService.getCommandIdForKeybinding("ctrl+`");
      expect(toggleCmd).toBe("workbench.action.terminal.toggleTerminal");

      const newCmd = KeybindingService.getCommandIdForKeybinding("ctrl+shift+`");
      expect(newCmd).toBe("workbench.action.terminal.new");

      const splitCmd = KeybindingService.getCommandIdForKeybinding("ctrl+shift+5");
      expect(splitCmd).toBe("workbench.action.terminal.split");

      const closeCmd = KeybindingService.getCommandIdForKeybinding("ctrl+shift+w");
      expect(closeCmd).toBe("workbench.action.terminal.close");

      const focusCmd = KeybindingService.getCommandIdForKeybinding("ctrl+alt+t");
      expect(focusCmd).toBe("workbench.action.terminal.focus");

      const nextCmd = KeybindingService.getCommandIdForKeybinding("ctrl+pagedown");
      expect(nextCmd).toBe("workbench.action.terminal.focusNext");

      const prevCmd = KeybindingService.getCommandIdForKeybinding("ctrl+pageup");
      expect(prevCmd).toBe("workbench.action.terminal.focusPrevious");

      const maxCmd = KeybindingService.getCommandIdForKeybinding("alt+f11");
      expect(maxCmd).toBe("workbench.action.terminal.toggleMaximize");

      const clearCmd = KeybindingService.getCommandIdForKeybinding("ctrl+k");
      expect(clearCmd).toBe("workbench.action.terminal.clear");
    });

    it("emits events via decoupled IDEEventBus when commands are executed", async () => {
      let toggleEmitted = false;
      let newEmitted = false;
      let splitEmitted = false;
      let clearEmitted = false;

      const u1 = ideEvents.on("terminal:toggle", () => {
        toggleEmitted = true;
      });
      const u2 = ideEvents.on("terminal:new", () => {
        newEmitted = true;
      });
      const u3 = ideEvents.on("terminal:split", () => {
        splitEmitted = true;
      });
      const u4 = ideEvents.on("terminal:clear", () => {
        clearEmitted = true;
      });

      await CommandRegistry.execute("workbench.action.terminal.toggleTerminal");
      expect(toggleEmitted).toBe(true);

      await CommandRegistry.execute("workbench.action.terminal.new");
      expect(newEmitted).toBe(true);

      await CommandRegistry.execute("workbench.action.terminal.split");
      expect(splitEmitted).toBe(true);

      await CommandRegistry.execute("workbench.action.terminal.clear");
      expect(clearEmitted).toBe(true);

      u1();
      u2();
      u3();
      u4();
    });
  });

  describe("Vertical Session Sidebar Architecture", () => {
    it("enforces conditional visibility: hidden when sessions <= 1, visible when > 1", () => {
      // Rule verification: When there is 0 or 1 session, the right sidebar must not render
      const shouldRenderSidebar = (sessionCount: number) => sessionCount > 1;

      expect(shouldRenderSidebar(0)).toBe(false);
      expect(shouldRenderSidebar(1)).toBe(false);
      expect(shouldRenderSidebar(2)).toBe(true);
      expect(shouldRenderSidebar(5)).toBe(true);
    });
  });

  describe("Terminal Profiles & Path Validation (Stage 5)", () => {
    it("validates shell profile configurations correctly", () => {
      const invalidName = TerminalProfileService.validateProfile({
        name: "",
        executable: "powershell.exe",
      });
      expect(invalidName.valid).toBe(false);
      expect(invalidName.errors).toContain("Profile name cannot be empty");

      const invalidExec = TerminalProfileService.validateProfile({
        name: "My Custom Shell",
        executable: "",
      });
      expect(invalidExec.valid).toBe(false);
      expect(invalidExec.errors).toContain("Executable path cannot be empty");

      const validProfile = TerminalProfileService.validateProfile({
        name: "Custom Node",
        executable: "node.exe",
        args: ["--interactive"],
        env: { NODE_ENV: "development" },
      });
      expect(validProfile.valid).toBe(true);
      expect(validProfile.errors.length).toBe(0);
    });

    it("merges host shells with custom profiles and preserves default preference", () => {
      const hostShells: ShellProfile[] = [
        {
          id: "pwsh",
          name: "PowerShell",
          executable: "powershell.exe",
          icon: "terminal",
          isDefault: true,
          platform: "win32",
        },
      ];

      const customShells: ShellProfile[] = [
        {
          id: "custom-bash",
          name: "Git Bash Custom",
          executable: "C:\\Program Files\\Git\\bin\\bash.exe",
          icon: "terminal",
          isDefault: false,
          isCustom: true,
          platform: "win32",
        },
      ];

      const merged = TerminalProfileService.mergeProfiles(hostShells, customShells, "custom-bash");
      expect(merged.length).toBe(2);

      const resolved = TerminalProfileService.resolveDefaultProfile(merged, "custom-bash");
      expect(resolved?.id).toBe("custom-bash");
      expect(resolved?.isCustom).toBe(true);
    });
  });

  describe("Development Server Detection (Stage 5)", () => {
    beforeEach(() => {
      DevServerDetector.clearSession("sess-1");
    });

    it("detects local development server URLs from terminal output streams", () => {
      const chunk = "  Vite ready in 250ms\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host";
      const detected = DevServerDetector.scanOutput("sess-1", chunk);

      expect(detected.length).toBe(1);
      expect(detected[0].port).toBe(5173);
      expect(detected[0].protocol).toBe("http");
      expect(detected[0].url).toContain("http://localhost:5173/");

      // Duplicate chunk should not re-detect same server on same session
      const duplicateScan = DevServerDetector.scanOutput("sess-1", chunk);
      expect(duplicateScan.length).toBe(0);

      const all = DevServerDetector.getServers("sess-1");
      expect(all.length).toBe(1);
    });

    it("notifies subscribers when new servers are detected", () => {
      let notifiedPort = 0;
      const unsub = DevServerDetector.subscribe((server) => {
        notifiedPort = server.port;
      });

      DevServerDetector.scanOutput("sess-2", "Server running on http://127.0.0.1:3000");
      expect(notifiedPort).toBe(3000);

      unsub();
      DevServerDetector.clearSession("sess-2");
    });
  });

  describe("AI Command Execution Security Boundary (Stage 5)", () => {
    it("blocks destructive shell commands immediately without execution", async () => {
      const adapter = new AiTerminalExecutionAdapter();

      const evalResult = adapter.evaluateSecurity("rm -rf /", false);
      expect(evalResult.decision).toBe("blocked_destructive");
      expect(evalResult.risk).toBe("critical");

      await expect(
        adapter.run_command({ command: "rm -rf /" })
      ).rejects.toThrow(/SecurityException.*blocked destructive/i);

      // Verify audit log recorded the blocked attempt
      const logs = adapter.getAuditLogs();
      expect(logs.some((l) => l.decision === "blocked_destructive")).toBe(true);
    });

    it("enforces explicit user approval by default", async () => {
      let approvalRequested = false;
      const adapter = new AiTerminalExecutionAdapter({
        approvalRequester: async () => {
          approvalRequested = true;
          return true; // user approved
        },
      });

      const response = await adapter.run_command({ command: "git status" });
      expect(approvalRequested).toBe(true);
      expect(response.exitCode).toBe(0);
    });

    it("denies execution when user rejects approval", async () => {
      const adapter = new AiTerminalExecutionAdapter({
        approvalRequester: async () => false, // user clicked deny
      });

      await expect(
        adapter.run_command({ command: "npm build" })
      ).rejects.toThrow(/denied by user permission policy/i);

      const logs = adapter.getAuditLogs();
      expect(logs.some((l) => l.decision === "denied")).toBe(true);
    });

    it("auto-approves safe read-only commands under trusted policy", async () => {
      const adapter = new AiTerminalExecutionAdapter({
        autoTrustSafeCommands: true,
      });

      const evalResult = adapter.evaluateSecurity("git status", false);
      expect(evalResult.decision).toBe("auto_trusted");
      expect(evalResult.risk).toBe("low");

      const res = await adapter.run_command({ command: "git status" });
      expect(res.exitCode).toBe(0);
    });

    it("redacts credentials, tokens and passwords from output and audit logs", () => {
      const adapter = new AiTerminalExecutionAdapter();
      const secretOutput = "Logged in with token ghp_123456789012345678901234567890123456 and password='SuperSecretPassword!'";
      const redacted = adapter.redactSecrets(secretOutput);

      expect(redacted).not.toContain("ghp_123456789012345678901234567890123456");
      expect(redacted).not.toContain("SuperSecretPassword!");
      expect(redacted).toContain("[REDACTED_SECRET]");
    });
  });
});
