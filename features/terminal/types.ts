/**
 * Strongly typed domain models and contracts for Kairo IDE's Integrated Terminal subsystem.
 */

export interface ShellProfile {
  id: string;
  name: string;
  executable: string;
  args?: string[];
  icon: string;
  isDefault: boolean;
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
}

export interface TerminalCreateConfig {
  shellId?: string;
  executable?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
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
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: "var(--font-mono), 'Geist Mono', Consolas, monospace",
  lineHeight: 1.25,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
};
