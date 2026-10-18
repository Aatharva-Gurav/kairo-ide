import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "./command-registry";
import { Command } from "./types";

describe("CommandRegistry", () => {
  beforeEach(() => {
    CommandRegistry.clear();
  });

  it("registers and retrieves a command", () => {
    const cmd: Command = {
      id: "test.command",
      title: "Test Command",
      category: "workbench",
      execute: vi.fn(),
    };

    CommandRegistry.register(cmd);
    expect(CommandRegistry.get("test.command")).toEqual(cmd);
    expect(CommandRegistry.getAll()).toHaveLength(1);
  });

  it("unregisters command cleanly via return callback", () => {
    const cmd: Command = {
      id: "test.unreg",
      title: "Unreg Command",
      category: "editor",
      execute: vi.fn(),
    };

    const unregister = CommandRegistry.register(cmd);
    expect(CommandRegistry.get("test.unreg")).toBeDefined();

    unregister();
    expect(CommandRegistry.get("test.unreg")).toBeUndefined();
  });

  it("retrieves commands filtered by category", () => {
    CommandRegistry.register({
      id: "editor.cmd1",
      title: "Editor 1",
      category: "editor",
      execute: vi.fn(),
    });
    CommandRegistry.register({
      id: "workbench.cmd1",
      title: "Workbench 1",
      category: "workbench",
      execute: vi.fn(),
    });

    const editorCmds = CommandRegistry.getByCategory("editor");
    expect(editorCmds).toHaveLength(1);
    expect(editorCmds[0].id).toBe("editor.cmd1");
  });

  it("executes an enabled command successfully", async () => {
    const executeFn = vi.fn();
    CommandRegistry.register({
      id: "test.exec",
      title: "Exec Test",
      category: "workbench",
      execute: executeFn,
    });

    const result = await CommandRegistry.execute("test.exec");
    expect(result).toBe(true);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it("refuses to execute a disabled command", async () => {
    const executeFn = vi.fn();
    CommandRegistry.register({
      id: "test.disabled",
      title: "Disabled Test",
      category: "workbench",
      enabled: () => false,
      execute: executeFn,
    });

    const result = await CommandRegistry.execute("test.disabled");
    expect(result).toBe(false);
    expect(executeFn).not.toHaveBeenCalled();
  });

  it("handles async commands and catches execution errors gracefully", async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error("Disk error"));
    CommandRegistry.register({
      id: "test.asyncErr",
      title: "Async Error Test",
      category: "editor",
      execute: executeFn,
    });

    const result = await CommandRegistry.execute("test.asyncErr");
    expect(result).toBe(false);
  });

  it("returns false for non-existent commands", async () => {
    const result = await CommandRegistry.execute("non.existent");
    expect(result).toBe(false);
  });

  it("notifies listeners when commands change", () => {
    const listener = vi.fn();
    const unsub = CommandRegistry.subscribe(listener);

    CommandRegistry.register({
      id: "test.notif",
      title: "Notification Test",
      category: "workbench",
      execute: vi.fn(),
    });

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

