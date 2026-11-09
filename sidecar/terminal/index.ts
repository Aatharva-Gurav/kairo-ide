/**
 * Terminal execution bridge for Kairo AI Agent sidecar & Cline tools.
 * Connects controlled non-interactive command execution with security permission boundaries.
 */

export interface CommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs?: number;
  truncated?: boolean;
}

export interface BackgroundProcessHandle {
  processId: number;
  executionId: string;
  command: string;
  cwd: string;
  startedAt: number;
}

export interface ProcessStatusSnapshot {
  executionId: string;
  status: "running" | "completed" | "timed_out" | "killed" | "failed";
  exitCode?: number;
  stdout: string;
  stderr: string;
}

export interface ITerminalManager {
  executeCommand(
    command: string,
    cwd?: string,
    timeoutMs?: number,
    maxOutputBytes?: number
  ): Promise<CommandExecutionResult>;

  executeBackgroundCommand?(
    command: string,
    cwd?: string,
    maxOutputBytes?: number
  ): Promise<BackgroundProcessHandle>;

  getCommandOutput?(executionId: string): Promise<ProcessStatusSnapshot>;

  listRunningProcesses?(): Promise<BackgroundProcessHandle[]>;

  stopProcess?(executionId: string): Promise<boolean>;
}
