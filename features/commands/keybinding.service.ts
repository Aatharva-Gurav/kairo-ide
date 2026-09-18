import { Keybinding, KeybindingConflict, ResolvedKeybinding } from "./types";
import { CommandRegistry } from "./command-registry";

export const KEYBINDINGS_STORAGE_KEY = "kairo:keybindings";

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { commandId: "workbench.commandPalette", key: "ctrl+shift+p", macKey: "cmd+shift+p" },
  { commandId: "workbench.quickOpen", key: "ctrl+p", macKey: "cmd+p" },
  { commandId: "workbench.openSettings", key: "ctrl+,", macKey: "cmd+," },
  { commandId: "workbench.toggleSidebar", key: "ctrl+b", macKey: "cmd+b" },
  { commandId: "editor.save", key: "ctrl+s", macKey: "cmd+s" },
  { commandId: "editor.saveAll", key: "ctrl+shift+s", macKey: "cmd+shift+s" },
  { commandId: "editor.close", key: "ctrl+w", macKey: "cmd+w" },
  { commandId: "editor.goToLine", key: "ctrl+g", macKey: "cmd+g" },
  { commandId: "editor.formatDocument", key: "shift+alt+f", macKey: "shift+alt+f" },
  { commandId: "search.findInWorkspace", key: "ctrl+shift+f", macKey: "cmd+shift+f" },
  { commandId: "editor.goToDefinition", key: "f12", macKey: "f12" },
  { commandId: "editor.peekDefinition", key: "alt+f12", macKey: "alt+f12" },
];

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export class KeybindingService {
  private static customKeybindings: Record<string, string | null> = {};
  private static isInitialized = false;

  static init(): void {
    if (this.isInitialized) return;
    this.customKeybindings = this.loadStoredCustomKeybindings();
    this.isInitialized = true;
  }

  /**
   * Detects if the current host environment is macOS.
   */
  static isMacOS(): boolean {
    if (typeof navigator === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userAgentData = (navigator as any).userAgentData;
    if (userAgentData?.platform) {
      return /mac/i.test(userAgentData.platform);
    }
    return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
  }

  /**
   * Normalizes a KeyboardEvent into a standard canonical key string (e.g. "ctrl+shift+p").
   */
  static normalizeKeyboardEvent(e: KeyboardEvent): string {
    const isMac = this.isMacOS();
    const parts: string[] = [];

    // Modifiers in consistent canonical order
    if (isMac ? e.metaKey : e.ctrlKey) {
      parts.push("ctrl");
    }
    if (e.altKey) {
      parts.push("alt");
    }
    if (e.shiftKey) {
      parts.push("shift");
    }
    // If mac has Ctrl pressed separately from Meta
    if (isMac && e.ctrlKey) {
      parts.push("control");
    }

    let key = e.key.toLowerCase();

    // Map common key aliases
    if (key === "escape") key = "esc";
    else if (key === " ") key = "space";
    else if (key === "arrowup") key = "up";
    else if (key === "arrowdown") key = "down";
    else if (key === "arrowleft") key = "left";
    else if (key === "arrowright") key = "right";

    // Ignore pure modifier presses
    if (["control", "meta", "alt", "shift"].includes(key)) {
      return parts.join("+");
    }

    parts.push(key);
    return parts.join("+");
  }

  /**
   * Normalizes a user-specified string into canonical format (e.g. "Ctrl + Shift + S" -> "ctrl+shift+s").
   */
  static normalizeKeyString(raw: string): string {
    const tokens = raw
      .toLowerCase()
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);

    const isMac = this.isMacOS();
    const parts: string[] = [];

    if (tokens.includes("ctrl") || tokens.includes("cmd") || tokens.includes("command")) {
      parts.push(isMac ? "cmd" : "ctrl");
    }
    if (tokens.includes("alt") || tokens.includes("option")) {
      parts.push("alt");
    }
    if (tokens.includes("shift")) {
      parts.push("shift");
    }

    // Append non-modifier keys
    for (const t of tokens) {
      if (!["ctrl", "cmd", "command", "alt", "option", "shift"].includes(t)) {
        parts.push(t);
      }
    }

    return parts.join("+");
  }

  /**
   * Gets the active normalized keybinding for a command.
   */
  static getRawKeybindingForCommand(commandId: string): string | null {
    this.ensureInit();

    // 1. Check user custom overrides
    if (commandId in this.customKeybindings) {
      return this.customKeybindings[commandId]; // null means unbound
    }

    // 2. Fall back to default
    const isMac = this.isMacOS();
    const def = DEFAULT_KEYBINDINGS.find((kb) => kb.commandId === commandId);
    if (def) {
      return isMac && def.macKey ? def.macKey : def.key;
    }

    return null;
  }

  /**
   * Gets the command ID associated with an active key combination.
   */
  static getCommandIdForKeybinding(rawKey: string): string | null {
    this.ensureInit();
    const isMac = this.isMacOS();
    const normalizedInput = rawKey.toLowerCase();

    // 1. Check custom overrides
    for (const [cmdId, key] of Object.entries(this.customKeybindings)) {
      if (key && key.toLowerCase() === normalizedInput) {
        return cmdId;
      }
    }

    // 2. Check defaults
    for (const def of DEFAULT_KEYBINDINGS) {
      // If user has customized or cleared this command, don't use default
      if (def.commandId in this.customKeybindings) {
        continue;
      }

      const activeKey = (isMac && def.macKey ? def.macKey : def.key).toLowerCase();
      // Handle "ctrl" matching "cmd" on mac
      const normalizedDef = activeKey.replace(/^cmd\+/, "ctrl+");
      const normalizedTarget = normalizedInput.replace(/^cmd\+/, "ctrl+");

      if (normalizedDef === normalizedTarget) {
        return def.commandId;
      }
    }

    return null;
  }

  /**
   * Detects whether assigning a keybinding will conflict with an existing command.
   */
  static findConflict(rawKey: string, targetCommandId: string): KeybindingConflict | null {
    const existingCmdId = this.getCommandIdForKeybinding(rawKey);
    if (existingCmdId && existingCmdId !== targetCommandId) {
      const existingCommand = CommandRegistry.get(existingCmdId);
      if (existingCommand) {
        return {
          existingCommand,
          newCommandId: targetCommandId,
          key: this.formatDisplay(rawKey),
        };
      }
    }
    return null;
  }

  /**
   * Assigns a custom keybinding to a command.
   */
  static setKeybinding(commandId: string, rawKey: string): void {
    this.ensureInit();
    const norm = this.normalizeKeyString(rawKey);
    this.customKeybindings[commandId] = norm;
    this.persistCustomKeybindings();
  }

  /**
   * Resets a command's keybinding to its default setting.
   */
  static resetKeybinding(commandId: string): void {
    this.ensureInit();
    delete this.customKeybindings[commandId];
    this.persistCustomKeybindings();
  }

  /**
   * Unbinds (clears) a command's shortcut.
   */
  static clearKeybinding(commandId: string): void {
    this.ensureInit();
    this.customKeybindings[commandId] = null;
    this.persistCustomKeybindings();
  }

  /**
   * Resets all custom keybindings to defaults.
   */
  static resetAllKeybindings(): void {
    this.customKeybindings = {};
    this.persistCustomKeybindings();
  }

  /**
   * Formats a raw key string into a clean UI display label (e.g. "Ctrl+Shift+P" or "⌘⇧P").
   */
  static formatDisplay(rawKey: string | null): string {
    if (!rawKey) return "";
    const isMac = this.isMacOS();

    return rawKey
      .split("+")
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "ctrl" || lower === "cmd") return isMac ? "⌘" : "Ctrl";
        if (lower === "shift") return isMac ? "⇧" : "Shift";
        if (lower === "alt") return isMac ? "⌥" : "Alt";
        if (lower === "esc") return "Esc";
        if (lower.length === 1) return lower.toUpperCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(isMac ? "" : "+");
  }

  /**
   * Resolves all commands into a list of ResolvedKeybinding records.
   */
  static getAllResolvedKeybindings(): ResolvedKeybinding[] {
    this.ensureInit();
    const allCommands = CommandRegistry.getAll();
    const result: ResolvedKeybinding[] = [];

    for (const cmd of allCommands) {
      const rawKey = this.getRawKeybindingForCommand(cmd.id);
      const isCustom = cmd.id in this.customKeybindings;

      result.push({
        command: cmd,
        rawKey: rawKey || "",
        keybinding: this.formatDisplay(rawKey),
        source: isCustom ? "user" : "default",
      });
    }

    return result;
  }

  private static ensureInit(): void {
    if (!this.isInitialized) {
      this.init();
    }
  }

  private static loadStoredCustomKeybindings(): Record<string, string | null> {
    const storage = getStorage();
    if (!storage) return {};

    try {
      const raw = storage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private static persistCustomKeybindings(): void {
    const storage = getStorage();
    if (!storage) return;

    try {
      storage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(this.customKeybindings));
    } catch (err) {
      console.error("[KeybindingService] Failed to persist keybindings:", err);
    }
  }
}
