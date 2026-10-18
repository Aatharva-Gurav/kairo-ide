import { invokeCommand, basename, normalizePath } from "@/lib/tauri-ipc";
import { Workspace, RecentWorkspace, PersistedWorkspaceExplorerState } from "./types";

export const STORAGE_KEYS = {
  RECENT_WORKSPACES: "kairo:recent_workspaces",
  LAST_ACTIVE_WORKSPACE: "kairo:last_active_workspace",
  WORKSPACE_STATE_PREFIX: "kairo:workspace_state:",
} as const;

export const MAX_RECENT_PROJECTS = 20;

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export class WorkspaceService {
  /**
   * Triggers native OS folder picker dialog via Tauri backend.
   */
  static async pickFolder(): Promise<string | null> {
    try {
      const selected = await invokeCommand<string | null>("workspace_pick_folder");
      return selected ? normalizePath(selected) : null;
    } catch (error) {
      console.error("[WorkspaceService] Failed to pick folder:", error);
      throw error;
    }
  }

  /**
   * Validates if a directory path exists and is accessible.
   */
  static async validatePath(pathStr: string): Promise<boolean> {
    try {
      return await invokeCommand<boolean>("workspace_validate_path", {
        path: normalizePath(pathStr),
      });
    } catch (error) {
      console.warn("[WorkspaceService] Path validation failed for:", pathStr, error);
      return false;
    }
  }

  /**
   * Detects project characteristics (e.g. Node.js, TypeScript, Rust, Python, etc.)
   */
  static async detectProjectCharacteristics(rootPath: string): Promise<string[]> {
    try {
      const types = await invokeCommand<string[]>("workspace_detect_project", {
        rootPath: normalizePath(rootPath),
      });
      return types || [];
    } catch {
      return [];
    }
  }

  /**
   * Creates a workspace model from a root directory path (multi-root ready).
   */
  static createWorkspace(rootPath: string, projectTypes?: string[]): Workspace {
    const norm = normalizePath(rootPath);
    const name = basename(norm) || norm;
    const id = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const rootId = `root_${Date.now().toString(36)}_0`;

    return {
      id,
      name,
      rootPath: norm,
      roots: [
        {
          id: rootId,
          name,
          path: norm,
        },
      ],
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      openedAt: Date.now(),
      projectTypes,
    };
  }

  /**
   * Loads recent workspaces from persistent storage.
   */
  static getRecentWorkspaces(): RecentWorkspace[] {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEYS.RECENT_WORKSPACES);
      if (!raw) return [];
      const parsed: RecentWorkspace[] = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.error("[WorkspaceService] Error reading recent workspaces:", e);
      return [];
    }
  }

  /**
   * Saves recent workspaces list to persistent storage.
   */
  static saveRecentWorkspaces(list: RecentWorkspace[]): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEYS.RECENT_WORKSPACES, JSON.stringify(list));
    } catch (e) {
      console.error("[WorkspaceService] Error saving recent workspaces:", e);
    }
  }

  /**
   * Clears all recent workspaces from persistent storage.
   */
  static clearRecentWorkspaces(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(STORAGE_KEYS.RECENT_WORKSPACES);
  }

  /**
   * Adds or updates a workspace in the recent projects list.
   */
  static addRecentWorkspace(workspace: Workspace): RecentWorkspace[] {
    const existing = this.getRecentWorkspaces();
    const normPath = normalizePath(workspace.rootPath).toLowerCase();

    const filtered = existing.filter(
      (item) => normalizePath(item.rootPath).toLowerCase() !== normPath
    );

    const newRecent: RecentWorkspace = {
      id: workspace.id,
      name: workspace.name,
      rootPath: normalizePath(workspace.rootPath),
      lastOpenedAt: Date.now(),
      openedAt: Date.now(),
      exists: true,
      projectTypes: workspace.projectTypes,
    };

    const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_PROJECTS);
    this.saveRecentWorkspaces(updated);
    return updated;
  }

  /**
   * Removes a recent workspace from the list.
   */
  static removeRecentWorkspace(rootPath: string): RecentWorkspace[] {
    const existing = this.getRecentWorkspaces();
    const normTarget = normalizePath(rootPath).toLowerCase();
    const updated = existing.filter(
      (item) => normalizePath(item.rootPath).toLowerCase() !== normTarget
    );
    this.saveRecentWorkspaces(updated);
    return updated;
  }

  /**
   * Sets the last active workspace in persistent storage.
   */
  static setLastActiveWorkspace(workspace: Workspace | null): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      if (workspace) {
        storage.setItem(STORAGE_KEYS.LAST_ACTIVE_WORKSPACE, JSON.stringify(workspace));
      } else {
        storage.removeItem(STORAGE_KEYS.LAST_ACTIVE_WORKSPACE);
      }
    } catch (e) {
      console.error("[WorkspaceService] Error setting last active workspace:", e);
    }
  }

  /**
   * Restores the last active workspace on startup if accessible.
   */
  static async restoreLastWorkspace(): Promise<Workspace | null> {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEYS.LAST_ACTIVE_WORKSPACE);
      if (!raw) return null;
      const parsed: Workspace = JSON.parse(raw);
      if (!parsed || !parsed.rootPath) return null;

      const isValid = await this.validatePath(parsed.rootPath);
      if (isValid) {
        const detected = await this.detectProjectCharacteristics(parsed.rootPath);
        const restored: Workspace = {
          ...parsed,
          roots: parsed.roots || [{ id: `root_${Date.now()}`, name: parsed.name, path: parsed.rootPath }],
          lastOpenedAt: Date.now(),
          openedAt: Date.now(),
          projectTypes: detected.length > 0 ? detected : parsed.projectTypes,
        };
        this.addRecentWorkspace(restored);
        this.setLastActiveWorkspace(restored);
        return restored;
      } else {
        console.warn("[WorkspaceService] Last workspace directory is no longer accessible:", parsed.rootPath);
        this.setLastActiveWorkspace(null);

        const recents = this.getRecentWorkspaces();
        const normTarget = normalizePath(parsed.rootPath).toLowerCase();
        const updated = recents.map((item) =>
          normalizePath(item.rootPath).toLowerCase() === normTarget ? { ...item, exists: false } : item
        );
        this.saveRecentWorkspaces(updated);
        return null;
      }
    } catch (error) {
      console.error("[WorkspaceService] Failed restoring last workspace:", error);
      this.setLastActiveWorkspace(null);
      return null;
    }
  }

  /**
   * Persists explorer state specific to this workspace.
   */
  static saveWorkspaceState(workspacePath: string, state: PersistedWorkspaceExplorerState): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const key = `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${normalizePath(workspacePath).toLowerCase()}`;
      storage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error("[WorkspaceService] Error saving workspace state:", e);
    }
  }

  /**
   * Loads explorer state specific to this workspace.
   */
  static getWorkspaceState(workspacePath: string): PersistedWorkspaceExplorerState | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const key = `${STORAGE_KEYS.WORKSPACE_STATE_PREFIX}${normalizePath(workspacePath).toLowerCase()}`;
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error("[WorkspaceService] Error loading workspace state:", e);
      return null;
    }
  }
}
