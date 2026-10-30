/**
 * Types and interfaces for Kairo IDE's centralized Command and Keybinding systems.
 */

export type CommandCategory =
  | "workbench"
  | "file"
  | "edit"
  | "view"
  | "explorer"
  | "editor"
  | "navigation"
  | "search"
  | "settings";

export interface Command {
  id: string; // Unique identifier (e.g. "editor.save", "workbench.openFolder")
  title: string; // User-facing name (e.g. "Save", "Open Folder")
  description?: string; // Optional detailed description
  category: CommandCategory; // Organizational category
  keywords?: string[]; // Extra search keywords for Command Palette
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any; // Optional icon component
  execute: () => void | Promise<void>; // Execution function
  enabled?: () => boolean; // Predicate returning whether command is currently enabled
}

export type KeybindingSource = "default" | "user";

export interface Keybinding {
  commandId: string;
  key: string; // Normalized string (e.g. "ctrl+s", "ctrl+shift+p", "f12")
  macKey?: string; // Optional macOS specific override (e.g. "cmd+s")
  when?: string; // Context condition (e.g. "editorTextFocus", "explorerFocus", "global")
}

export interface ResolvedKeybinding {
  command: Command;
  keybinding: string; // Formatted display key, e.g. "Ctrl+Shift+P"
  rawKey: string; // Normalized key string, e.g. "ctrl+shift+p"
  source: KeybindingSource;
}

export interface KeybindingConflict {
  existingCommand: Command;
  newCommandId: string;
  key: string;
}

