export interface WorkspaceRoot {
  id: string;
  name: string;
  path: string;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string; // primary root (for backwards compatibility and active context)
  roots: WorkspaceRoot[]; // multi-root ready internal architecture
  createdAt: number;
  lastOpenedAt: number;
  openedAt: number;
  projectTypes?: string[]; // e.g. ["Node.js", "TypeScript", "Tauri"]
}

export interface RecentWorkspace {
  id: string;
  name: string;
  rootPath: string;
  lastOpenedAt: number;
  openedAt?: number;
  exists?: boolean;
  projectTypes?: string[];
}

export interface PersistedWorkspaceExplorerState {
  expandedPaths: string[];
  selectedPath?: string;
  selectedPaths?: string[];
  sortMode?: string;
  showHidden?: boolean;
}

export interface WorkspaceState {
  activeWorkspace: Workspace | null;
  recentWorkspaces: RecentWorkspace[];
  isLoading: boolean;
  error: string | null;
}
