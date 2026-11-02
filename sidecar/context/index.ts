/**
 * Workspace context inspector stub for Kairo AI Agent sidecar.
 * Will be fully implemented in Stage 04 (gathering repo structure, .gitignore, open tabs).
 */

export interface WorkspaceContext {
  rootPath: string;
  openFiles: string[];
  activeFile?: string;
}

export interface IContextManager {
  gatherContext(): Promise<WorkspaceContext>;
}
