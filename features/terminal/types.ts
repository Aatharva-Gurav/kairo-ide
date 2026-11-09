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
  customProfiles: ShellProfile[];
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: "var(--font-mono), 'Geist Mono', Consolas, monospace",
  fontWeight: "normal",
  lineHeight: 1.25,
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
  customProfiles: [],
};

// ==========================================
// AI Command Execution Contracts
// ==========================================

export type AiProcessStatus = "running" | "completed" | "timed_out" | "killed" | "failed";

export interface RunCommandRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  trusted?: boolean;
}

export interface RunCommandResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  truncated: boolean;
}

export interface RunBackgroundCommandRequest {
  command: string;
  cwd?: string;
  maxOutputBytes?: number;
  trusted?: boolean;
}

export interface RunBackgroundCommandResponse {
  processId: number;
  executionId: string;
  command: string;
  cwd: string;
  startedAt: number;
}

export interface GetCommandOutputRequest {
  executionId: string;
}

export interface GetCommandOutputResponse {
  executionId: string;
  status: AiProcessStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
}

export interface ListProcessesRequest {
  onlyActive?: boolean;
}

export interface TrackedAiProcess {
  processId: number;
  executionId: string;
  command: string;
  cwd: string;
  status: AiProcessStatus;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
}

export interface ListProcessesResponse {
  processes: TrackedAiProcess[];
}

export interface StopProcessRequest {
  executionId: string;
  force?: boolean;
}

export interface StopProcessResponse {
  stopped: boolean;
  reason?: string;
}
