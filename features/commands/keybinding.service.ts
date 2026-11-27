import { Keybinding, KeybindingConflict, ResolvedKeybinding } from "./types";
import { CommandRegistry } from "./command-registry";
import { getSafeLocalStorage } from "@/lib/storage";

export const KEYBINDINGS_STORAGE_KEY = "kairo:keybindings";

export interface KeybindingContext {
  terminalFocus?: boolean;
  editorTextFocus?: boolean;
  explorerFocus?: boolean;
}

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { commandId: "workbench.openFile", key: "ctrl+o", macKey: "cmd+o" },
  { commandId: "workbench.openFolder", key: "ctrl+shift+o", macKey: "cmd+shift+o" },
  { commandId: "workbench.closeWorkspace", key: "ctrl+k f", macKey: "cmd+k f" },
  { commandId: "workbench.commandPalette", key: "ctrl+shift+p", macKey: "cmd+shift+p" },
  { commandId: "workbench.quickOpen", key: "ctrl+p", macKey: "cmd+p" },
  { commandId: "workbench.openSettings", key: "ctrl+,", macKey: "cmd+," },
  { commandId: "workbench.openKeyboardShortcuts", key: "ctrl+k ctrl+s", macKey: "cmd+k cmd+s" },
  { commandId: "workbench.toggleSidebar", key: "ctrl+b", macKey: "cmd+b" },
  { commandId: "explorer.focus", key: "ctrl+shift+e", macKey: "cmd+shift+e" },
  { commandId: "explorer.newFile", key: "ctrl+n", macKey: "cmd+n" },
  { commandId: "explorer.focusFilter", key: "ctrl+f", macKey: "cmd+f", when: "explorerFocus" },
  { commandId: "editor.save", key: "ctrl+s", macKey: "cmd+s" },
  { commandId: "editor.saveAll", key: "ctrl+shift+s", macKey: "cmd+shift+s" },
  { commandId: "editor.close", key: "ctrl+w", macKey: "cmd+w" },
  { commandId: "editor.closeAll", key: "ctrl+k ctrl+w", macKey: "cmd+k cmd+w" },
  { commandId: "editor.find", key: "ctrl+f", macKey: "cmd+f" },
  { commandId: "editor.replace", key: "ctrl+h", macKey: "cmd+h" },
  { commandId: "editor.goToLine", key: "ctrl+g", macKey: "cmd+g" },
  { commandId: "editor.formatDocument", key: "shift+alt+f", macKey: "shift+alt+f" },
  { commandId: "search.findInWorkspace", key: "ctrl+shift+f", macKey: "cmd+shift+f" },
  { commandId: "editor.goToDefinition", key: "f12", macKey: "f12" },
  { commandId: "editor.peekDefinition", key: "alt+f12", macKey: "alt+f12" },
  { commandId: "workbench.action.splitEditor", key: "ctrl+\\", macKey: "cmd+\\" },
  { commandId: "workbench.action.splitEditorDown", key: "ctrl+k ctrl+\\", macKey: "cmd+k cmd+\\" },
  { commandId: "editor.zoomIn", key: "ctrl+=", macKey: "cmd+=" },
  { commandId: "editor.zoomOut", key: "ctrl+-", macKey: "cmd+-" },
  { commandId: "editor.zoomReset", key: "ctrl+0", macKey: "cmd+0" },
  { commandId: "workbench.action.terminal.toggleTerminal", key: "ctrl+`", macKey: "cmd+`" },
  { commandId: "workbench.action.terminal.new", key: "ctrl+shift+`", macKey: "cmd+shift+`" },
  { commandId: "workbench.action.terminal.split", key: "ctrl+shift+5", macKey: "cmd+shift+5" },
  { commandId: "workbench.action.terminal.close", key: "ctrl+shift+w", macKey: "cmd+shift+w" },
  { commandId: "workbench.action.terminal.focus", key: "ctrl+alt+t", macKey: "cmd+alt+t" },
  { commandId: "workbench.action.terminal.focusNext", key: "ctrl+pagedown", macKey: "cmd+pagedown" },
  { commandId: "workbench.action.terminal.focusPrevious", key: "ctrl+pageup", macKey: "cmd+pageup" },
  { commandId: "workbench.action.terminal.toggleMaximize", key: "alt+f11", macKey: "alt+f11" },
  { commandId: "workbench.action.terminal.clear", key: "ctrl+k", macKey: "cmd+k", when: "terminalFocus" },
  { commandId: "workbench.action.terminal.find", key: "ctrl+f", macKey: "cmd+f", when: "terminalFocus" },
];

const SHIFTED_FALLBACK_KEY_MAP: Record<string, string> = {
  "~": "`",
  "!": "1",
  "@": "2",
  "#": "3",
  "$": "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
};

/**
 * Splits key combinations by '+' while properly preserving literal '+' key as the last token.
 * E.g. "ctrl+shift++" -> ["ctrl", "shift", "+"]
 */
export function splitKeyTokens(rawKey: string): string[] {
  if (!rawKey) return [];
  const trimmed = rawKey.trim();
  if (trimmed.endsWith("++")) {
    const prefix = trimmed.slice(0, -2);
    const parts = prefix.split("+").map((s) => s.trim()).filter(Boolean);
    parts.push("+");
    return parts;
  }
  return trimmed.split("+").map((s) => s.trim()).filter(Boolean);
}

function getStorage(): Storage | null {
  return getSafeLocalStorage();
}

function normalizeChordForCompare(rawKey: string): string {
  return rawKey
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^cmd\+/, "ctrl+"))
    .join(" ");
}

function getDefaultWhen(commandId: string): string | undefined {
  return DEFAULT_KEYBINDINGS.find((kb) => kb.commandId === commandId)?.when;
}

function matchesWhen(when: string | undefined, context?: KeybindingContext): boolean {
  if (!when || when === "global") return true;
  if (!context) return true;
  if (when === "terminalFocus") return Boolean(context.terminalFocus);
  if (when === "explorerFocus") return Boolean(context.explorerFocus);
  if (when === "editorTextFocus") return Boolean(context.editorTextFocus);
  return true;
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
   * Checks whether a token is purely a modifier key.
   */
  static isModifierKey(key: string): boolean {
    if (!key) return false;
    const lower = key.toLowerCase();
    return ["ctrl", "cmd", "command", "alt", "option", "shift", "control", "meta"].includes(lower);
  }

  /**
   * Checks whether a key combination contains at least one non-modifier key.
   */
  static hasNonModifierKey(rawKey: string): boolean {
    if (!rawKey) return false;
    const chords = rawKey.trim().split(/\s+/);
    return chords.every((chord) => {
      const tokens = splitKeyTokens(chord);
      return tokens.some((t) => !this.isModifierKey(t));
    });
  }

  /**
   * Detects if the current host workstation is macOS.
   */
  static isMacOS(): boolean {
    if (typeof navigator === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userAgentData = (navigator as any).userAgentData;
    if (userAgentData?.platform) {
      return /mac/i.test(userAgentData.platform);
    }
    return /mac|darwin/i.test(navigator.platform || navigator.userAgent || "");
  }

  /**
   * Detects if the current host workstation is Windows.
   */
  static isWindows(): boolean {
    if (typeof navigator === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userAgentData = (navigator as any).userAgentData;
    if (userAgentData?.platform) {
      return /win/i.test(userAgentData.platform);
    }
    return /win/i.test(navigator.platform || navigator.userAgent || "");
  }

  /**
   * Detects if the current host workstation is Linux.
   */
  static isLinux(): boolean {
    if (typeof navigator === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userAgentData = (navigator as any).userAgentData;
    if (userAgentData?.platform) {
      return /linux/i.test(userAgentData.platform);
    }
    return /linux|x11/i.test(navigator.platform || navigator.userAgent || "");
  }

  /**
   * Returns the current workstation desktop OS: 'macos' | 'windows' | 'linux'.
   */
  static getDesktopOS(): "macos" | "windows" | "linux" {
    if (this.isMacOS()) return "macos";
    if (this.isLinux()) return "linux";
    return "windows";
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

    let key = (e.key || "").toLowerCase();

    // Ignore pure modifier presses
    if (["control", "meta", "alt", "shift"].includes(key)) {
      return parts.join("+");
    }

    // Map physical key codes for symbols/digits affected by Shift or keyboard layout
    const code = e.code || "";
    if (code === "Backquote") {
      key = "`";
    } else if (/^Digit([0-9])$/.test(code)) {
      key = code.slice(5);
    } else if (/^Numpad([0-9])$/.test(code)) {
      key = code.slice(6);
    } else if (code === "NumpadAdd") {
      key = "+";
    } else if (code === "NumpadSubtract") {
      key = "-";
    } else if (code === "NumpadMultiply") {
      key = "*";
    } else if (code === "NumpadDivide") {
      key = "/";
    } else if (code === "NumpadDecimal") {
      key = ".";
    } else if (!code && e.shiftKey && key in SHIFTED_FALLBACK_KEY_MAP) {
      key = SHIFTED_FALLBACK_KEY_MAP[key];
    }

    // Map common key aliases
    if (key === "escape") key = "esc";
    else if (key === " ") key = "space";
    else if (key === "arrowup") key = "up";
    else if (key === "arrowdown") key = "down";
    else if (key === "arrowleft") key = "left";
    else if (key === "arrowright") key = "right";

    parts.push(key);
    return parts.join("+");
  }

  /**
   * Normalizes a user-specified string into canonical format (e.g. "Ctrl + Shift + S" -> "ctrl+shift+s").
   */
  static normalizeKeyString(raw: string): string {
    const collapsed = raw.toLowerCase().replace(/\s*\+\s*/g, "+").trim();
    if (!collapsed) return "";

    const chords = collapsed.split(/\s+/);
    const isMac = this.isMacOS();

    return chords
      .map((chord) => {
        const tokens = splitKeyTokens(chord);
        const parts: string[] = [];

        if (tokens.includes("ctrl") || tokens.includes("cmd") || tokens.includes("command") || tokens.includes("meta")) {
          parts.push(isMac ? "cmd" : "ctrl");
        }
        if (tokens.includes("alt") || tokens.includes("option")) {
          parts.push("alt");
        }
        if (tokens.includes("shift")) {
          parts.push("shift");
        }
        if (isMac && tokens.includes("control")) {
          parts.push("control");
        }

        // Append non-modifier keys
        for (const t of tokens) {
          if (!this.isModifierKey(t)) {
            if (t === "escape") parts.push("esc");
            else if (t === " ") parts.push("space");
            else parts.push(t);
          }
        }

        return parts.join("+");
      })
      .filter(Boolean)
      .join(" ");
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
   * Gets the command ID associated with an active key combination, optionally filtered by focus context.
   */
  static getCommandIdForKeybinding(rawKey: string, context?: KeybindingContext): string | null {
    this.ensureInit();
    const isMac = this.isMacOS();
    const normalizedInput = normalizeChordForCompare(rawKey);
    if (!normalizedInput) return null;

    const candidates: Array<{ commandId: string; when?: string }> = [];

    // 1. Custom overrides first
    for (const [cmdId, key] of Object.entries(this.customKeybindings)) {
      if (key && normalizeChordForCompare(key) === normalizedInput) {
        candidates.push({ commandId: cmdId, when: getDefaultWhen(cmdId) });
      }
    }

    // 2. Default keybindings (skipping customized/cleared commands)
    for (const def of DEFAULT_KEYBINDINGS) {
      if (def.commandId in this.customKeybindings) {
        continue;
      }

      const activeKey = isMac && def.macKey ? def.macKey : def.key;
      if (normalizeChordForCompare(activeKey) === normalizedInput) {
        candidates.push({ commandId: def.commandId, when: def.when });
      }
    }

    if (candidates.length === 0) return null;

    if (context) {
      // Context-specific match wins over global/unconstrained bindings
      const scopedMatch = candidates.find(
        (c) => c.when && c.when !== "global" && matchesWhen(c.when, context)
      );
      if (scopedMatch) return scopedMatch.commandId;

      const globalMatch = candidates.find((c) => !c.when || c.when === "global");
      return globalMatch ? globalMatch.commandId : null;
    }

    // Without context (e.g. unit tests / generic lookup), prefer unconstrained binding then scoped
    const globalMatch = candidates.find((c) => !c.when || c.when === "global");
    return (globalMatch ?? candidates[0]).commandId;
  }

  /**
   * Checks whether rawKey is the first stroke of any active two-key chord shortcut in the given context.
   */
  static isChordPrefix(rawKey: string, context?: KeybindingContext): boolean {
    this.ensureInit();
    const isMac = this.isMacOS();
    const prefix = `${normalizeChordForCompare(rawKey)} `;
    if (prefix.trim() === "") return false;

    for (const [cmdId, key] of Object.entries(this.customKeybindings)) {
      if (key && normalizeChordForCompare(key).startsWith(prefix)) {
        if (!context || matchesWhen(getDefaultWhen(cmdId), context)) {
          return true;
        }
      }
    }

    for (const def of DEFAULT_KEYBINDINGS) {
      if (def.commandId in this.customKeybindings) continue;
      const activeKey = isMac && def.macKey ? def.macKey : def.key;
      if (normalizeChordForCompare(activeKey).startsWith(prefix)) {
        if (!context || matchesWhen(def.when, context)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detects whether assigning a keybinding will conflict with an existing command in the same context.
   */
  static findConflict(rawKey: string, targetCommandId: string): KeybindingConflict | null {
    const targetWhen = getDefaultWhen(targetCommandId);
    const isMac = this.isMacOS();
    const normalizedInput = normalizeChordForCompare(rawKey);
    if (!normalizedInput) return null;

    const matchCommand = (cmdId: string, key: string | null | undefined, when?: string): boolean => {
      if (!key || cmdId === targetCommandId) return false;
      if (normalizeChordForCompare(key) !== normalizedInput) return false;
      const sameScope = !when || !targetWhen || when === "global" || targetWhen === "global" || when === targetWhen;
      return sameScope;
    };

    for (const [cmdId, key] of Object.entries(this.customKeybindings)) {
      if (matchCommand(cmdId, key, getDefaultWhen(cmdId))) {
        const existingCommand = CommandRegistry.get(cmdId);
        if (existingCommand) {
          return {
            existingCommand,
            newCommandId: targetCommandId,
            key: this.formatDisplay(rawKey),
          };
        }
      }
    }

    for (const def of DEFAULT_KEYBINDINGS) {
      if (def.commandId in this.customKeybindings) continue;
      const activeKey = isMac && def.macKey ? def.macKey : def.key;
      if (matchCommand(def.commandId, activeKey, def.when)) {
        const existingCommand = CommandRegistry.get(def.commandId);
        if (existingCommand) {
          return {
            existingCommand,
            newCommandId: targetCommandId,
            key: this.formatDisplay(rawKey),
          };
        }
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
      .trim()
      .split(/\s+/)
      .map((chord) =>
        splitKeyTokens(chord)
          .map((part) => {
            const lower = part.toLowerCase();
            if (lower === "ctrl" || lower === "cmd") return isMac ? "⌘" : "Ctrl";
            if (lower === "control") return isMac ? "⌃" : "Ctrl";
            if (lower === "shift") return isMac ? "⇧" : "Shift";
            if (lower === "alt" || lower === "option") return isMac ? "⌥" : "Alt";
            if (lower === "esc") return "Esc";
            if (lower === "space") return "Space";
            if (lower === "up") return "Up";
            if (lower === "down") return "Down";
            if (lower === "left") return "Left";
            if (lower === "right") return "Right";
            if (lower.length === 1) return lower.toUpperCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
          })
          .join(isMac ? "" : "+")
      )
      .join(" ");
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
