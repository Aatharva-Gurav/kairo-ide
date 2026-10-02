import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeybindingService, KEYBINDINGS_STORAGE_KEY } from "./keybinding.service";
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
      execute: vi.fn(),
    });
    CommandRegistry.register({
      id: "editor.formatDocument",
      title: "Format Document",
      category: "editor",
      execute: vi.fn(),
    });
  });

  it("resolves default keybinding for standard commands", () => {
    const rawKey = KeybindingService.getRawKeybindingForCommand("editor.save");
    expect(rawKey).toBe("ctrl+s");
    expect(KeybindingService.formatDisplay(rawKey)).toBe("Ctrl+S");
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
});

