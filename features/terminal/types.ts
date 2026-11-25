/**
 * Strongly typed domain models and contracts for Kairo IDE's Integrated Terminal subsystem.
 */

export interface ShellProfile {
  id: string;
  name: string;
  executable: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  startupCommand?: string;
  icon: string;
  isDefault: boolean;
  isCustom?: boolean;
  platform: string;
}

export type SessionStatus = "running" | "exited" | "failed";

export interface TerminalSessionInfo {
  sessionId: string;
  pid?: number;
  shell: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  status: SessionStatus;
  createdAt: number;
  exitCode?: number;
  workspaceId?: string;
}

export interface TerminalCreateConfig {
  shellId?: string;
  executable?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  workspaceId?: string;
}

export interface TerminalExitPayload {
  sessionId: string;
  code: number | null;
}

export interface TerminalSessionState {
  sessionId: string;
  title: string;
  shellProfile?: ShellProfile;
  info: TerminalSessionInfo;
  isExited: boolean;
  exitCode?: number;
  workspaceId?: string;
}

export type TerminalCursorStyle = "block" | "underline" | "bar";
export type TerminalFontWeight =
  | "normal"
  | "bold"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";
export type TerminalRightClickBehavior = "contextMenu" | "paste" | "selectWord";

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  fontWeight: TerminalFontWeight;
  lineHeight: number;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  theme: string;
  defaultProfile: string;
  defaultCwd: string;
  panelHeight: number;
  copyOnSelect: boolean;
  rightClickBehavior: TerminalRightClickBehavior;
  confirmKillProcess: boolean;
  persistAcrossWorkspaces: boolean;
  customProfiles: ShellProfile[];
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Fira Code', 'JetBrains Mono', 'Segoe UI Mono', 'Courier New', monospace",
  fontWeight: "normal",
  lineHeight: 1.35,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 10000,
  theme: "auto",
  defaultProfile: "",
  defaultCwd: "",
  panelHeight: 260,
  copyOnSelect: false,
  rightClickBehavior: "contextMenu",
  confirmKillProcess: true,
  persistAcrossWorkspaces: false,
  customProfiles: [],
};
