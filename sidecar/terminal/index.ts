/**
 * Terminal execution bridge stub for Kairo AI Agent sidecar.
 * Will be fully implemented in Stage 04 (bridging shell commands into Tauri PTY or child processes).
 */

export interface CommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ITerminalManager {
  executeCommand(command: string, cwd?: string): Promise<CommandExecutionResult>;
}
