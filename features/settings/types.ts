/**
 * Strongly typed settings domain models for Kairo IDE.
 * Covers Appearance, Editor, Files, Explorer, Search, and Keyboard settings.
 */

export type ThemePreference =
  | "dark"
  | "light"
  | "system"
  | "vs-dark"
  | "vs-light"
  | "one-dark-pro"
  | "dracula"
  | "tokyo-night"
  | "github-dark"
  | "monokai";
export type UIDensity = "normal" | "compact";
export type WordWrapPreference = "on" | "off" | "wordWrapColumn" | "bounded";
export type LineNumbersPreference = "on" | "off" | "relative";
export type CursorStylePreference = "line" | "block" | "underline" | "line-thin" | "block-outline" | "underline-thin";
export type CursorBlinkingPreference = "blink" | "smooth" | "phase" | "expand" | "solid";
export type RenderWhitespacePreference = "none" | "boundary" | "selection" | "trailing" | "all";
export type AutoSavePreference = "off" | "afterDelay" | "onFocusChange" | "onWindowChange";
export type ExplorerSortMode = "name" | "type" | "modified" | "size";

export interface AppearanceSettings {
  theme: ThemePreference;
  uiDensity: UIDensity;
  fontSize: number;
  sidebarVisible: boolean;
  sidebarPosition: "left" | "right";
  iconTheme: string;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: WordWrapPreference;
  lineNumbers: LineNumbersPreference;
  minimap: boolean;
  cursorStyle: CursorStylePreference;
  cursorBlinking: CursorBlinkingPreference;
  renderWhitespace: RenderWhitespacePreference;
  bracketPairGuides: boolean;
  stickyScroll: boolean;
  smoothScrolling: boolean;
  formatOnSave: boolean;
  formatOnPaste: boolean;
  formatOnType: boolean;
  confirmCloseUnsaved: boolean;
}

export interface FilesSettings {
  autoSave: AutoSavePreference;
  autoSaveDelay: number;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  confirmDelete: boolean;
  encoding: string;
}

export interface ExplorerSettings {
  showHidden: boolean;
  sortMode: ExplorerSortMode;
  foldersFirst: boolean;
  compactMode: boolean;
  confirmDelete: boolean;
  autoRefresh: boolean;
  excludePatterns: string[];
}

export interface SearchSettings {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegex: boolean;
  includePattern: string;
  excludePattern: string;
}

export interface KeyboardSettings {
  dispatchMode: "global";
}

export interface IDESettings {
  appearance: AppearanceSettings;
  editor: EditorSettings;
  files: FilesSettings;
  explorer: ExplorerSettings;
  search: SearchSettings;
  keyboard: KeyboardSettings;
}

export type SettingsCategory = keyof IDESettings;

export type SettingScope = "user" | "workspace" | "both";

export type SettingControlType = "boolean" | "number" | "string" | "select";

export interface SettingOption<T = string | number | boolean> {
  label: string;
  value: T;
}

export interface SettingDefinition<T = unknown> {
  key: string; // e.g. "editor.fontSize"
  category: SettingsCategory;
  label: string;
  description: string;
  type: SettingControlType;
  defaultValue: T;
  scope: SettingScope;
  options?: SettingOption<T>[];
  min?: number;
  max?: number;
  step?: number;
  validate?: (value: unknown) => boolean;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

