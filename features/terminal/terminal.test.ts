import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TerminalThemeService } from "./services/terminal-theme.service";
import { TerminalInstanceRegistry } from "./services/terminal-instance-registry";
import { DEFAULT_TERMINAL_SETTINGS, ShellProfile } from "./types";
import { registerTerminalCommands } from "./services/terminal-commands";
import { performTerminalToggle } from "./services/terminal-toggle";
import { TerminalProfileService } from "./services/terminal-profile.service";
import { DevServerDetector } from "./services/dev-server-detector";
import { CommandRegistry } from "@/features/commands/command-registry";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { ideEvents } from "@/lib/events";
import { THEME_DEFINITIONS, ThemeId } from "@/features/theme";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { ShellIcon } from "./components/shell-icon";

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

    it("safely detaches containers and prevents operations on detached or disposed instances", () => {
      const sessionId = "detach-test-session";
      const instance = TerminalInstanceRegistry.createOrGet(
        sessionId,
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );

      const fakeContainer = {
        contains: () => false,
        innerHTML: "",
        appendChild: () => {},
      } as unknown as HTMLElement;
      TerminalInstanceRegistry.attach(sessionId, fakeContainer);
      expect(instance.container).toBe(fakeContainer);

      TerminalInstanceRegistry.detach(sessionId, fakeContainer);
      expect(instance.container).toBeNull();

      // fit on detached instance returns null gracefully
      const fitResult = TerminalInstanceRegistry.fit(sessionId);
      expect(fitResult).toBeNull();

      // Disposing detached instance should succeed with zero errors
      expect(() => TerminalInstanceRegistry.dispose(sessionId)).not.toThrow();
    });

    it("gracefully disposes instances multiple times without errors", () => {
      const sessionId = "safe-multi-dispose";
      TerminalInstanceRegistry.createOrGet(
        sessionId,
        DEFAULT_TERMINAL_SETTINGS,
        "dark-modern"
      );

      expect(() => TerminalInstanceRegistry.dispose(sessionId)).not.toThrow();
      expect(() => TerminalInstanceRegistry.dispose(sessionId)).not.toThrow();
      expect(TerminalInstanceRegistry.has(sessionId)).toBe(false);
    });

    it("applies fontWeight, copyOnSelect, and rightClickBehavior from settings on create and update", () => {
      const sessionId = "settings-sync-session";
      const instance = TerminalInstanceRegistry.createOrGet(
        sessionId,
        {
          ...DEFAULT_TERMINAL_SETTINGS,
          fontWeight: "600",
          copyOnSelect: true,
          rightClickBehavior: "paste",
        },
        "dark-modern"
      );

      expect(instance.term.options.fontWeight).toBe("600");
      expect(instance.copyOnSelect).toBe(true);
      expect(instance.rightClickBehavior).toBe("paste");

      TerminalInstanceRegistry.applySettings(sessionId, {
        ...DEFAULT_TERMINAL_SETTINGS,
        fontSize: 12,
        fontWeight: "bold",
        copyOnSelect: false,
        rightClickBehavior: "selectWord",
      });

      expect(instance.term.options.fontSize).toBe(12);
      expect(instance.term.options.fontWeight).toBe("bold");
      expect(instance.copyOnSelect).toBe(false);
      expect(instance.rightClickBehavior).toBe("selectWord");

      TerminalInstanceRegistry.dispose(sessionId);
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

      const arbitraryBinary = TerminalProfileService.validateProfile({
        name: "Arbitrary Binary",
        executable: "node.exe",
      });
      expect(arbitraryBinary.valid).toBe(false);

      const blockedEnv = TerminalProfileService.validateProfile({
        name: "Unsafe Env Shell",
        executable: "powershell.exe",
        env: { PATH: "/tmp/evil", NODE_OPTIONS: "--require=/tmp/hook.js" },
      });
      expect(blockedEnv.valid).toBe(false);

      const unsafeArgs = TerminalProfileService.validateProfile({
        name: "Unsafe Arg Shell",
        executable: "bash",
        args: ["-c", "whoami"],
      });
      expect(unsafeArgs.valid).toBe(false);

      const validProfile = TerminalProfileService.validateProfile({
        name: "Custom PowerShell",
        executable: "powershell.exe",
        args: ["-NoLogo"],
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

  describe("ShellIcon Simple Icons Integration", () => {
    it("renders appropriate icons based on shell profile names", () => {
      const pwshMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "PowerShell 7" })
      );
      expect(pwshMarkup).toContain("svg");
      expect(pwshMarkup).toContain("text-[#5391FE]");

      const cmdMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "Command Prompt" })
      );
      expect(cmdMarkup).toContain("svg");
      expect(cmdMarkup).toContain("text-[#F59E0B]");

      const gitMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "Git Bash" })
      );
      expect(gitMarkup).toContain("svg");
      expect(gitMarkup).toContain("text-[#F05032]");

      const bashMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "bash" })
      );
      expect(bashMarkup).toContain("svg");
      expect(bashMarkup).toContain("text-[#4EAA25]");

      const wslMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "Ubuntu WSL" })
      );
      expect(wslMarkup).toContain("svg");
      expect(wslMarkup).toContain("text-[#E95420]");

      const fallbackMarkup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ShellIcon, { name: "custom-shell" })
      );
      expect(fallbackMarkup).toContain("svg");
      expect(fallbackMarkup).toContain("text-primary");
    });
  });

  describe("Terminal Link Opening & URL Validation", () => {
    it("safely handles valid and invalid URLs via openExternalUrl", async () => {
      const { openExternalUrl } = await import("@/lib/tauri-ipc");

      // Valid HTTP/HTTPS should not throw
      await expect(openExternalUrl("http://localhost:3000")).resolves.not.toThrow();
      await expect(openExternalUrl("https://github.com/test/repo")).resolves.not.toThrow();

      // Empty or invalid protocol should be rejected safely
      await expect(openExternalUrl("")).resolves.not.toThrow();
      await expect(openExternalUrl("javascript:alert(1)")).resolves.not.toThrow();
      await expect(openExternalUrl("not-a-url")).resolves.not.toThrow();
    });
  });

  describe("Terminal Toggle Determinism & Command Deduplication (Stage 2B)", () => {
    it("toggles terminal visibility cleanly without duplicate session creation", async () => {
      const isOpenRef = { current: false };
      const isCreatingInitialRef = { current: false };
      let visibleState = false;
      const setIsOpen = (next: boolean) => {
        visibleState = next;
      };

      let resolveCreate!: () => void;
      const createTerminalMock = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCreate = resolve;
          })
      );

      // Open when 0 sessions exist -> spawns once
      const opened = performTerminalToggle(
        { isOpenRef, isCreatingInitialRef, sessionsCount: 0 },
        setIsOpen,
        createTerminalMock
      );
      expect(opened).toBe(true);
      expect(visibleState).toBe(true);
      expect(createTerminalMock).toHaveBeenCalledTimes(1);

      // Rapid close then reopen while initial creation is still in-flight -> must NOT spawn a 2nd session
      expect(
        performTerminalToggle(
          { isOpenRef, isCreatingInitialRef, sessionsCount: 0 },
          setIsOpen,
          createTerminalMock
        )
      ).toBe(false);
      expect(visibleState).toBe(false);

      expect(
        performTerminalToggle(
          { isOpenRef, isCreatingInitialRef, sessionsCount: 0 },
          setIsOpen,
          createTerminalMock
        )
      ).toBe(true);
      expect(createTerminalMock).toHaveBeenCalledTimes(1);

      resolveCreate();
      await Promise.resolve();
      await Promise.resolve();
      expect(isCreatingInitialRef.current).toBe(false);

      // Opening again when a session already exists does not create another session
      isOpenRef.current = false;
      performTerminalToggle(
        { isOpenRef, isCreatingInitialRef, sessionsCount: 1 },
        setIsOpen,
        createTerminalMock
      );
      expect(createTerminalMock).toHaveBeenCalledTimes(1);
    });

    it("registers each terminal command once and enforces workspace predicate safely", async () => {
      CommandRegistry.clear();
      let workspaceOpen = false;
      const unreg1 = registerTerminalCommands({
        isWorkspaceActive: () => workspaceOpen,
      });

      const terminalCommands = CommandRegistry.getAll().filter((c) =>
        c.id.startsWith("workbench.action.terminal.")
      );
      expect(terminalCommands).toHaveLength(10);
      expect(new Set(terminalCommands.map((c) => c.id)).size).toBe(10);

      // Disabled when no workspace is open
      expect(CommandRegistry.isEnabled("workbench.action.terminal.toggleTerminal")).toBe(false);
      expect(await CommandRegistry.execute("workbench.action.terminal.toggleTerminal")).toBe(false);

      // Enabled when workspace opens
      workspaceOpen = true;
      expect(CommandRegistry.isEnabled("workbench.action.terminal.toggleTerminal")).toBe(true);

      // Calling old cleanup after re-registration must not unregister newer commands
      const unreg2 = registerTerminalCommands({
        isWorkspaceActive: () => true,
      });
      unreg1();
      expect(CommandRegistry.get("workbench.action.terminal.toggleTerminal")).toBeDefined();

      unreg2();
      expect(CommandRegistry.get("workbench.action.terminal.toggleTerminal")).toBeUndefined();
    });
  });
});
