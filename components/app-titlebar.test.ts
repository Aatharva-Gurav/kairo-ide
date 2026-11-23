import { describe, it, expect, vi } from "vitest";
import { getMenuDefinitions } from "./app-titlebar";
import { Workspace } from "@/features/workspace/types";

describe("AppTitleBar Menu Definitions - Welcome Screen vs Workspace", () => {
  const mockWorkspace: Workspace = {
    id: "test-ws-id",
    name: "test-project",
    rootPath: "/path/to/test-project",
    roots: [
      {
        id: "root-1",
        name: "test-project",
        path: "/path/to/test-project",
      },
    ],
    projectTypes: ["node"],
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
    openedAt: Date.now(),
  };

  describe("Welcome Screen state (activeWorkspace === null)", () => {
    it("disables 'New Text File' (create new file option) in File menu", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: null,
      });

      const newFileItem = menus.file?.find((item) => item.id === "file.new");
      expect(newFileItem).toBeDefined();
      expect(newFileItem?.disabled).toBe(true);
    });

    it("disables all options in the Terminal section", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: null,
      });

      const terminalMenu = menus.terminal;
      expect(terminalMenu).toBeDefined();

      const newTerm = terminalMenu?.find((item) => item.id === "terminal.new");
      const splitTerm = terminalMenu?.find((item) => item.id === "terminal.split");
      const toggleTerm = terminalMenu?.find((item) => item.id === "terminal.toggle");
      const clearTerm = terminalMenu?.find((item) => item.id === "terminal.clear");
      const killTerm = terminalMenu?.find((item) => item.id === "terminal.kill");

      expect(newTerm?.disabled).toBe(true);
      expect(splitTerm?.disabled).toBe(true);
      expect(toggleTerm?.disabled).toBe(true);
      expect(clearTerm?.disabled).toBe(true);
      expect(killTerm?.disabled).toBe(true);
    });

    it("disables 'Terminal' option in View menu", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: null,
      });

      const viewTerminalItem = menus.view?.find((item) => item.id === "view.terminal");
      expect(viewTerminalItem).toBeDefined();
      expect(viewTerminalItem?.disabled).toBe(true);
    });

    it("does not call startCreateFile when action is executed while activeWorkspace is null", async () => {
      const startCreateFileMock = vi.fn();
      const menus = getMenuDefinitions({
        activeWorkspace: null,
        actions: {
          startCreateFile: startCreateFileMock,
        },
      });

      const newFileItem = menus.file?.find((item) => item.id === "file.new");
      await newFileItem?.action?.();

      expect(startCreateFileMock).not.toHaveBeenCalled();
    });
  });

  describe("Workspace Open state (activeWorkspace !== null)", () => {
    it("enables 'New Text File' (create new file option) in File menu", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
      });

      const newFileItem = menus.file?.find((item) => item.id === "file.new");
      expect(newFileItem).toBeDefined();
      expect(newFileItem?.disabled).toBe(false);
    });

    it("calls startCreateFile when 'New Text File' action is executed in an open workspace", async () => {
      const startCreateFileMock = vi.fn();
      const menus = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
        actions: {
          startCreateFile: startCreateFileMock,
        },
      });

      const newFileItem = menus.file?.find((item) => item.id === "file.new");
      await newFileItem?.action?.();

      expect(startCreateFileMock).toHaveBeenCalledTimes(1);
    });

    it("enables terminal section options (new, split, toggle, clear) in Terminal menu", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
      });

      const terminalMenu = menus.terminal;
      expect(terminalMenu).toBeDefined();

      const newTerm = terminalMenu?.find((item) => item.id === "terminal.new");
      const splitTerm = terminalMenu?.find((item) => item.id === "terminal.split");
      const toggleTerm = terminalMenu?.find((item) => item.id === "terminal.toggle");
      const clearTerm = terminalMenu?.find((item) => item.id === "terminal.clear");

      expect(newTerm?.disabled).toBe(false);
      expect(splitTerm?.disabled).toBe(false);
      expect(toggleTerm?.disabled).toBe(false);
      expect(clearTerm?.disabled).toBe(false);
    });

    it("enables 'Terminal' option in View menu", () => {
      const menus = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
      });

      const viewTerminalItem = menus.view?.find((item) => item.id === "view.terminal");
      expect(viewTerminalItem).toBeDefined();
      expect(viewTerminalItem?.disabled).toBe(false);
    });

    it("enables 'Kill Active Terminal' only when an active session exists in open workspace", () => {
      const killTerminalMock = vi.fn();

      // Without active session
      const menusNoSession = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
        terminal: null,
      });
      const killNoSession = menusNoSession.terminal?.find((item) => item.id === "terminal.kill");
      expect(killNoSession?.disabled).toBe(true);

      // With active session
      const menusWithSession = getMenuDefinitions({
        activeWorkspace: mockWorkspace,
        terminal: {
          activeSessionId: "session-123",
          activeSplitSessionId: null,
          killTerminal: killTerminalMock,
        },
      });
      const killWithSession = menusWithSession.terminal?.find((item) => item.id === "terminal.kill");
      expect(killWithSession?.disabled).toBe(false);
    });
  });
});
