import { describe, it, expect, beforeEach } from "vitest";
import { KeybindingService, KEYBINDINGS_STORAGE_KEY, splitKeyTokens } from "./keybinding.service";
import { CommandRegistry } from "./command-registry";

// In-memory storage mock
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("KeybindingService", () => {
  beforeEach(() => {
    store.clear();
    CommandRegistry.clear();
    KeybindingService.resetAllKeybindings();

    // Register a couple of commands for conflict testing
    CommandRegistry.register({
      id: "editor.save",
      title: "Save",
      category: "editor",
      execute: () => {},
    });
    CommandRegistry.register({
      id: "editor.formatDocument",
      title: "Format Document",
      category: "editor",
      execute: () => {},
    });
    CommandRegistry.register({
      id: "editor.find",
      title: "Find in Current File",
      category: "editor",
      execute: () => {},
    });
    CommandRegistry.register({
      id: "editor.replace",
      title: "Replace in Current File",
      category: "editor",
      execute: () => {},
    });
  });

  it("resolves default keybinding for standard commands including find and replace", () => {
    const rawSave = KeybindingService.getRawKeybindingForCommand("editor.save");
    expect(rawSave).toBe("ctrl+s");
    expect(KeybindingService.formatDisplay(rawSave)).toBe("Ctrl+S");

    const rawFind = KeybindingService.getRawKeybindingForCommand("editor.find");
    expect(rawFind).toBe("ctrl+f");
    expect(KeybindingService.formatDisplay(rawFind)).toBe("Ctrl+F");

    const rawReplace = KeybindingService.getRawKeybindingForCommand("editor.replace");
    expect(rawReplace).toBe("ctrl+h");
    expect(KeybindingService.formatDisplay(rawReplace)).toBe("Ctrl+H");
  });

  it("looks up command ID from normalized key combination", () => {
    const cmdId = KeybindingService.getCommandIdForKeybinding("ctrl+s");
    expect(cmdId).toBe("editor.save");
  });

  it("assigns and persists custom keybinding", () => {
    KeybindingService.setKeybinding("editor.formatDocument", "ctrl+shift+i");
    expect(KeybindingService.getRawKeybindingForCommand("editor.formatDocument")).toBe("ctrl+shift+i");

    const stored = JSON.parse(localStorage.getItem(KEYBINDINGS_STORAGE_KEY)!);
    expect(stored["editor.formatDocument"]).toBe("ctrl+shift+i");
  });

  it("detects keybinding conflict with existing commands", () => {
    // ctrl+s is bound to editor.save
    const conflict = KeybindingService.findConflict("ctrl+s", "editor.formatDocument");
    expect(conflict).not.toBeNull();
    expect(conflict?.existingCommand.id).toBe("editor.save");
    expect(conflict?.existingCommand.title).toBe("Save");
  });

  it("does not report conflict when reassigning same command", () => {
    const conflict = KeybindingService.findConflict("ctrl+s", "editor.save");
    expect(conflict).toBeNull();
  });

  it("resets keybinding to default", () => {
    KeybindingService.setKeybinding("editor.save", "ctrl+alt+s");
    expect(KeybindingService.getRawKeybindingForCommand("editor.save")).toBe("ctrl+alt+s");

    KeybindingService.resetKeybinding("editor.save");
    expect(KeybindingService.getRawKeybindingForCommand("editor.save")).toBe("ctrl+s");
  });

  it("clears (unbinds) a keybinding", () => {
    KeybindingService.clearKeybinding("editor.save");
    expect(KeybindingService.getRawKeybindingForCommand("editor.save")).toBeNull();
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+s")).toBeNull();
  });

  it("normalizes keyboard events accurately", () => {
    const event = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
      key: "P",
    } as unknown as KeyboardEvent;

    const normalized = KeybindingService.normalizeKeyboardEvent(event);
    expect(normalized).toBe("ctrl+shift+p");
  });

  it("formats key combination display nicely", () => {
    expect(KeybindingService.formatDisplay("ctrl+shift+p")).toBe("Ctrl+Shift+P");
    expect(KeybindingService.formatDisplay("shift+alt+f")).toBe("Shift+Alt+F");
    expect(KeybindingService.formatDisplay(null)).toBe("");
  });

  it("handles shortcuts ending with '+' key correctly using splitKeyTokens", () => {
    expect(splitKeyTokens("ctrl++")).toEqual(["ctrl", "+"]);
    expect(splitKeyTokens("ctrl+shift++")).toEqual(["ctrl", "shift", "+"]);
    expect(splitKeyTokens("ctrl+s")).toEqual(["ctrl", "s"]);
    expect(KeybindingService.formatDisplay("ctrl++")).toBe("Ctrl++");
  });

  it("correctly checks modifier keys and complete shortcuts", () => {
    expect(KeybindingService.isModifierKey("ctrl")).toBe(true);
    expect(KeybindingService.isModifierKey("shift")).toBe(true);
    expect(KeybindingService.isModifierKey("s")).toBe(false);

    expect(KeybindingService.hasNonModifierKey("ctrl+shift")).toBe(false);
    expect(KeybindingService.hasNonModifierKey("ctrl+shift+s")).toBe(true);
    expect(KeybindingService.hasNonModifierKey("f12")).toBe(true);
  });

  it("detects desktop workstation OS correctly and ignores iOS/mobile", () => {
    // Test Windows platform
    const originalNavigator = global.navigator;
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32", userAgent: "Windows NT 10.0; Win64; x64" },
      configurable: true,
    });
    expect(KeybindingService.isWindows()).toBe(true);
    expect(KeybindingService.isMacOS()).toBe(false);
    expect(KeybindingService.isLinux()).toBe(false);
    expect(KeybindingService.getDesktopOS()).toBe("windows");

    // Test macOS platform
    Object.defineProperty(global, "navigator", {
      value: { platform: "MacIntel", userAgent: "Macintosh; Intel Mac OS X 10_15_7" },
      configurable: true,
    });
    expect(KeybindingService.isMacOS()).toBe(true);
    expect(KeybindingService.isWindows()).toBe(false);
    expect(KeybindingService.isLinux()).toBe(false);
    expect(KeybindingService.getDesktopOS()).toBe("macos");

    // Test Linux platform
    Object.defineProperty(global, "navigator", {
      value: { platform: "Linux x86_64", userAgent: "X11; Ubuntu; Linux x86_64" },
      configurable: true,
    });
    expect(KeybindingService.isLinux()).toBe(true);
    expect(KeybindingService.isMacOS()).toBe(false);
    expect(KeybindingService.isWindows()).toBe(false);
    expect(KeybindingService.getDesktopOS()).toBe("linux");

    // Test that iOS is NOT detected as macOS
    Object.defineProperty(global, "navigator", {
      value: { platform: "iPhone", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" },
      configurable: true,
    });
    expect(KeybindingService.isMacOS()).toBe(false);

    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("normalizes shifted digit and backquote keys for terminal shortcuts", () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32", userAgent: "Windows NT 10.0; Win64; x64" },
      configurable: true,
    });

    const newTerminalEvent = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
      key: "~",
      code: "Backquote",
    } as unknown as KeyboardEvent;

    const splitTerminalEvent = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
      key: "%",
      code: "Digit5",
    } as unknown as KeyboardEvent;

    const newNorm = KeybindingService.normalizeKeyboardEvent(newTerminalEvent);
    const splitNorm = KeybindingService.normalizeKeyboardEvent(splitTerminalEvent);

    expect(newNorm).toBe("ctrl+shift+`");
    expect(splitNorm).toBe("ctrl+shift+5");
    expect(KeybindingService.getCommandIdForKeybinding(newNorm)).toBe(
      "workbench.action.terminal.new"
    );
    expect(KeybindingService.getCommandIdForKeybinding(splitNorm)).toBe(
      "workbench.action.terminal.split"
    );

    // Fallback when e.code is omitted
    const fallbackSplit = KeybindingService.normalizeKeyboardEvent({
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
      key: "%",
    } as unknown as KeyboardEvent);
    expect(fallbackSplit).toBe("ctrl+shift+5");

    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("resolves context-aware shortcuts and two-key chord bindings", () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32", userAgent: "Windows NT 10.0; Win64; x64" },
      configurable: true,
    });

    // Context-sensitive Ctrl+F
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+f", { terminalFocus: true })).toBe(
      "workbench.action.terminal.find"
    );
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+f", { explorerFocus: true })).toBe(
      "explorer.focusFilter"
    );
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+f", { editorTextFocus: true })).toBe(
      "editor.find"
    );

    // Context-sensitive Ctrl+K (clears terminal when focused, acts as chord prefix outside terminal)
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+k", { terminalFocus: true })).toBe(
      "workbench.action.terminal.clear"
    );
    expect(
      KeybindingService.getCommandIdForKeybinding("ctrl+k", { editorTextFocus: true })
    ).toBeNull();
    expect(KeybindingService.isChordPrefix("ctrl+k", { editorTextFocus: true })).toBe(true);

    // Two-key chords
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+k ctrl+\\")).toBe(
      "workbench.action.splitEditorDown"
    );
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+k ctrl+w")).toBe("editor.closeAll");
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+k ctrl+s")).toBe(
      "workbench.openKeyboardShortcuts"
    );
    expect(KeybindingService.formatDisplay("ctrl+k ctrl+\\")).toBe("Ctrl+K Ctrl+\\");

    // Explorer defaults
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+shift+e")).toBe("explorer.focus");
    expect(KeybindingService.getCommandIdForKeybinding("ctrl+n")).toBe("explorer.newFile");

    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });
});
