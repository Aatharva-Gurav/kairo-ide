import { invokeCommand, basename, normalizePath } from "@/lib/tauri-ipc";
import { getSafeLocalStorage } from "@/lib/storage";
import { Workspace, RecentWorkspace, PersistedWorkspaceExplorerState } from "./types";
import { TerminalIpcService } from "@/features/terminal/services/terminal-ipc.service";
import { TerminalInstanceRegistry } from "@/features/terminal/services/terminal-instance-registry";
import { SettingsService } from "@/features/settings/services/settings.service";
import { ModelService } from "@/features/editor/services/model.service";
import { fsWatcher } from "@/lib/watcher";
import { directoryCache } from "@/features/file-explorer/cache";

export const STORAGE_KEYS = {
  RECENT_WORKSPACES: "kairo:recent_workspaces",
  LAST_ACTIVE_WORKSPACE: "kairo:last_active_workspace",
  WORKSPACE_STATE_PREFIX: "kairo:workspace_state:",
} as const;

export const MAX_RECENT_PROJECTS = 20;

function getStorage(): Storage | null {
  return getSafeLocalStorage();
}

export interface WorkspaceAuthInfo {
  rootPath: string;
  roots: string[];
  workspaceId?: string;
  generation: number;
}

export class WorkspaceService {
  /**
   * Registers and authorizes a workspace root in the native Rust WorkspaceGuard.
   */
  static async openNativeWorkspace(
    rootPath: string,
    workspaceId?: string
  ): Promise<WorkspaceAuthInfo> {
    return await invokeCommand<WorkspaceAuthInfo>("workspace_open", {
      rootPath: normalizePath(rootPath),
      workspaceId: workspaceId ?? null,
    });
  }

  /**
   * Clears workspace authorization in the native Rust WorkspaceGuard.
   */
  static async closeNativeWorkspace(): Promise<void> {
    await invokeCommand<void>("workspace_close");
  }

  /**
   * Adds an authorized root folder to the active native workspace.
   */
  static async addNativeRoot(rootPath: string): Promise<WorkspaceAuthInfo> {
    return await invokeCommand<WorkspaceAuthInfo>("workspace_add_root", {
      rootPath: normalizePath(rootPath),
    });
  }

  /**
   * Removes an authorized root folder from the active native workspace.
   */
  static async removeNativeRoot(rootPath: string): Promise<WorkspaceAuthInfo> {
    return await invokeCommand<WorkspaceAuthInfo>("workspace_remove_root", {
      rootPath: normalizePath(rootPath),
    });
  }

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
    if (!pathStr || typeof pathStr !== "string" || !pathStr.trim()) {
      return false;
    }
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
    if (!rootPath || typeof rootPath !== "string" || !rootPath.trim()) {
      return [];
    }
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
    const norm = normalizePath(rootPath || "");
    const name = basename(norm) || norm || "Untitled";
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
   * Adds an additional folder root to an existing workspace (multi-root workspace).
   */
  static addRootFolder(workspace: Workspace, folderPath: string): Workspace {
    if (!workspace || !folderPath) return workspace;
    const norm = normalizePath(folderPath);
    const existing = workspace.roots.find(
      (r) => normalizePath(r.path).toLowerCase() === norm.toLowerCase()
    );
    if (existing) return workspace;

    const name = basename(norm) || norm;
    const rootId = `root_${Date.now().toString(36)}_${workspace.roots.length}`;
    const newRoot = { id: rootId, name, path: norm };

    return {
      ...workspace,
      roots: [...workspace.roots, newRoot],
      lastOpenedAt: Date.now(),
    };
  }

  /**
   * Removes a folder root from a multi-root workspace (keeps at least 1 root).
   */
  static removeRootFolder(workspace: Workspace, rootIdOrPath: string): Workspace {
    if (!workspace || !rootIdOrPath || workspace.roots.length <= 1) return workspace;
    const norm = normalizePath(rootIdOrPath).toLowerCase();
    const filtered = workspace.roots.filter(
      (r) => r.id !== rootIdOrPath && normalizePath(r.path).toLowerCase() !== norm
    );

    if (filtered.length === 0) return workspace;

    const newPrimary = filtered[0];
    return {
      ...workspace,
      rootPath: newPrimary.path,
      name: filtered.length === 1 ? newPrimary.name : workspace.name,
      roots: filtered,
      lastOpenedAt: Date.now(),
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
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
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
      storage.setItem(STORAGE_KEYS.RECENT_WORKSPACES, JSON.stringify(Array.isArray(list) ? list : []));
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
    if (!workspace || !workspace.rootPath) {
      return this.getRecentWorkspaces();
    }
    const existing = this.getRecentWorkspaces();
    const normPath = normalizePath(workspace.rootPath).toLowerCase();

    const filtered = (existing || []).filter(
      (item) => item && item.rootPath && normalizePath(item.rootPath).toLowerCase() !== normPath
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
    if (!rootPath || typeof rootPath !== "string") {
      return this.getRecentWorkspaces();
    }
    const existing = this.getRecentWorkspaces();
    const normTarget = normalizePath(rootPath).toLowerCase();
    const updated = (existing || []).filter(
      (item) => item && item.rootPath && normalizePath(item.rootPath).toLowerCase() !== normTarget
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
        try {
          await this.openNativeWorkspace(parsed.rootPath, parsed.id);
        } catch (authErr) {
          console.warn("[WorkspaceService] Native workspace authorization failed on restore:", authErr);
          await this.closeNativeWorkspace().catch(() => {});
          this.setLastActiveWorkspace(null);
          return null;
        }

        const extraRoots = (parsed.roots || []).slice(1);
        for (const extra of extraRoots) {
          if (extra?.path) {
            await this.addNativeRoot(extra.path).catch(() => {});
          }
        }

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
          item && item.rootPath && normalizePath(item.rootPath).toLowerCase() === normTarget
            ? { ...item, exists: false }
            : item
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
    if (!workspacePath || typeof workspacePath !== "string") return;
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
    if (!workspacePath || typeof workspacePath !== "string") return null;
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

  /**
   * Performs an orderly, non-throwing cleanup of all resources associated with a workspace.
   * Reports actual stages to the caller.
   */
  static async cleanupWorkspaceResources(
    workspace: Workspace,
    onStageChange?: (stage: string) => void
  ): Promise<void> {
    if (!workspace) return;

    // Stage 1: Terminate all terminal sessions & child processes (unless persistAcrossWorkspaces is set)
    const settings = SettingsService.getEffectiveSettings();
    const shouldPersist = Boolean(settings.terminal?.persistAcrossWorkspaces);

    if (!shouldPersist) {
      onStageChange?.("Closing terminal sessions...");
      try {
        await TerminalIpcService.killWorkspaceSessions(workspace.id);
      } catch (err) {
        console.warn("[WorkspaceService] Error killing workspace terminal sessions:", err);
      }
      try {
        TerminalInstanceRegistry.disposeAll();
      } catch (err) {
        console.warn("[WorkspaceService] Error disposing terminal instances:", err);
      }
    } else {
      onStageChange?.("Preserving active terminal sessions...");
    }

    // Stage 2: Dispose Monaco editor resources
    onStageChange?.("Disposing editor resources...");
    try {
      ModelService.disposeAll();
    } catch (err) {
      console.warn("[WorkspaceService] Error disposing Monaco models:", err);
    }

    // Stage 3: Stop filesystem watchers & clear caches
    onStageChange?.("Stopping filesystem watchers...");
    try {
      if (workspace.roots && workspace.roots.length > 0) {
        for (const root of workspace.roots) {
          if (root.path) {
            await fsWatcher.unwatch(root.path).catch(() => {});
          }
        }
      } else if (workspace.rootPath) {
        await fsWatcher.unwatch(workspace.rootPath).catch(() => {});
      }
    } catch (err) {
      console.warn("[WorkspaceService] Error unwatching workspace path:", err);
    }
    try {
      directoryCache.clear();
    } catch (err) {
      console.warn("[WorkspaceService] Error clearing directory cache:", err);
    }

    // Stage 4: Releasing workspace resources
    onStageChange?.("Releasing workspace resources...");
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}
