"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { normalizePath, basename } from "@/lib/tauri-ipc";
import { Workspace, RecentWorkspace, WorkspaceLifecycleState } from "./types";
import { WorkspaceService } from "./service";
import { ideEvents } from "@/lib/events";
import { fsWatcher } from "@/lib/watcher";

export interface WorkspaceContextValue {
  activeWorkspace: Workspace | null;
  recentWorkspaces: RecentWorkspace[];
  isLoading: boolean;
  error: string | null;
  lifecycleState: WorkspaceLifecycleState;
  closingStage: string | null;
  targetWorkspaceName: string | null;
  isMultiRoot: boolean;
  openFolder: () => Promise<boolean>;
  openWorkspacePath: (path: string) => Promise<boolean>;
  closeWorkspace: () => Promise<boolean>;
  addFolderToWorkspace: (folderPath?: string) => Promise<boolean>;
  removeFolderFromWorkspace: (rootIdOrPath: string) => Promise<boolean>;
  registerBeforeCloseHook: (hook: () => Promise<boolean>) => () => void;
  removeRecent: (rootPath: string) => void;
  clearRecent: () => void;
  clearError: () => void;
  refreshRecent: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lifecycleState, setLifecycleState] = useState<WorkspaceLifecycleState>("CLOSED");
  const [closingStage, setClosingStage] = useState<string | null>(null);
  const [targetWorkspaceName, setTargetWorkspaceName] = useState<string | null>(null);

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  const lifecycleSeqRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const beforeCloseHooksRef = useRef<Set<() => Promise<boolean>>>(new Set());

  const registerBeforeCloseHook = useCallback((hook: () => Promise<boolean>) => {
    beforeCloseHooksRef.current.add(hook);
    return () => {
      beforeCloseHooksRef.current.delete(hook);
    };
  }, []);

  const runBeforeCloseHooks = async (): Promise<boolean> => {
    for (const hook of beforeCloseHooksRef.current) {
      try {
        const canProceed = await hook();
        if (!canProceed) return false;
      } catch (err) {
        console.error("[WorkspaceStore] Error in beforeCloseHook:", err);
        return false;
      }
    }
    return true;
  };

  const refreshRecent = useCallback(() => {
    setRecentWorkspaces(WorkspaceService.getRecentWorkspaces());
  }, []);

  // Restore previous workspace on initial mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setIsLoading(true);
      try {
        const restored = await WorkspaceService.restoreLastWorkspace();
        if (isMounted) {
          if (restored) {
            setActiveWorkspace(restored);
            setLifecycleState("OPEN");
            ideEvents.emit("workspace:opened", restored);
          } else {
            setLifecycleState("CLOSED");
          }
          setRecentWorkspaces(WorkspaceService.getRecentWorkspaces());
        }
      } catch (err) {
        console.error("[WorkspaceStore] Restore error:", err);
        if (isMounted) {
          setLifecycleState("CLOSED");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const closeWorkspace = useCallback(async (): Promise<boolean> => {
    const currentWorkspace = activeWorkspaceRef.current;
    if (!currentWorkspace) {
      setLifecycleState("CLOSED");
      return false;
    }

    if (isTransitioningRef.current) {
      return false;
    }

    // Check before-close hooks (e.g. unsaved changes dialog)
    const canProceed = await runBeforeCloseHooks();
    if (!canProceed) {
      return false;
    }

    isTransitioningRef.current = true;
    const currentSeq = ++lifecycleSeqRef.current;

    setError(null);
    setLifecycleState("CLOSING");
    setClosingStage("Closing terminal sessions...");

    try {
      ideEvents.emit("workspace:closing", { workspace: currentWorkspace });

      // Run structured teardown across all workspace-owned resources
      await WorkspaceService.cleanupWorkspaceResources(currentWorkspace, (stage) => {
        if (lifecycleSeqRef.current === currentSeq) {
          setClosingStage(stage);
        }
      });

      if (lifecycleSeqRef.current !== currentSeq) {
        return false;
      }

      // Finish closing state
      setActiveWorkspace(null);
      WorkspaceService.setLastActiveWorkspace(null);
      setRecentWorkspaces(WorkspaceService.getRecentWorkspaces());

      // 4-second delay in workspace closing warning while closing the workspace
      const closingStages = [
        "Closing terminal sessions...",
        "Disposing editor resources...",
        "Stopping filesystem watchers...",
        "Releasing workspace resources...",
      ];

      for (const stage of closingStages) {
        if (lifecycleSeqRef.current !== currentSeq) {
          return false;
        }
        setClosingStage(stage);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (lifecycleSeqRef.current === currentSeq) {
        setLifecycleState("CLOSED");
        setClosingStage(null);
        setTargetWorkspaceName(null);
        ideEvents.emit("workspace:closed", undefined);
      }
      return true;
    } catch (err: unknown) {
      console.error("[WorkspaceStore] Error during workspace close:", err);
      if (lifecycleSeqRef.current === currentSeq) {
        setActiveWorkspace(null);
        WorkspaceService.setLastActiveWorkspace(null);
        setLifecycleState("CLOSED");
        setClosingStage(null);
        setTargetWorkspaceName(null);
        ideEvents.emit("workspace:closed", undefined);
      }
      return false;
    } finally {
      isTransitioningRef.current = false;
    }
  }, []);

  const openWorkspacePath = useCallback(async (rootPath: string): Promise<boolean> => {
    if (!rootPath || typeof rootPath !== "string") {
      setError("Invalid workspace path.");
      return false;
    }

    if (isTransitioningRef.current) {
      return false;
    }

    // If an existing workspace is open, check before-close hooks first
    if (activeWorkspaceRef.current) {
      const canProceed = await runBeforeCloseHooks();
      if (!canProceed) {
        return false;
      }
    }

    isTransitioningRef.current = true;
    const currentSeq = ++lifecycleSeqRef.current;
    const currentWorkspace = activeWorkspaceRef.current;

    setError(null);
    const targetName = basename(normalizePath(rootPath)) || rootPath;
    setTargetWorkspaceName(targetName);

    try {
      // Step 1: If an existing workspace is active, safely close and teardown its resources first
      if (currentWorkspace) {
        setLifecycleState("SWITCHING");
        setClosingStage(`Closing ${currentWorkspace.name}...`);

        ideEvents.emit("workspace:closing", {
          workspace: currentWorkspace,
          targetWorkspace: {
            id: "",
            name: targetName,
            rootPath: normalizePath(rootPath),
          },
        });

        await WorkspaceService.cleanupWorkspaceResources(currentWorkspace, (stage) => {
          if (lifecycleSeqRef.current === currentSeq) {
            setClosingStage(stage);
          }
        });

        if (lifecycleSeqRef.current !== currentSeq) {
          return false;
        }

        // Emit switched notification
        ideEvents.emit("workspace:switched", {
          from: currentWorkspace,
          to: {
            id: "",
            name: targetName,
            rootPath: normalizePath(rootPath),
          },
        });
      } else {
        setLifecycleState("OPENING");
      }

      setClosingStage(`Opening ${targetName}...`);

      // Step 2: Validate the requested path
      const isValid = await WorkspaceService.validatePath(rootPath);
      if (!isValid) {
        const normTarget = normalizePath(rootPath).toLowerCase();
        const recents = WorkspaceService.getRecentWorkspaces().map((item) =>
          item && item.rootPath && normalizePath(item.rootPath).toLowerCase() === normTarget
            ? { ...item, exists: false }
            : item
        );
        WorkspaceService.saveRecentWorkspaces(recents);
        setRecentWorkspaces(recents);

        if (lifecycleSeqRef.current === currentSeq) {
          setActiveWorkspace(null);
          WorkspaceService.setLastActiveWorkspace(null);
          setLifecycleState("CLOSED");
          setClosingStage(null);
          setTargetWorkspaceName(null);
          setError(`The directory "${rootPath}" is no longer accessible.`);
        }
        return false;
      }

      // Step 3: Initialize new workspace
      const detectedTypes = await WorkspaceService.detectProjectCharacteristics(rootPath);
      const ws = WorkspaceService.createWorkspace(rootPath, detectedTypes);
      const updatedRecents = WorkspaceService.addRecentWorkspace(ws);
      WorkspaceService.setLastActiveWorkspace(ws);

      if (lifecycleSeqRef.current === currentSeq) {
        setActiveWorkspace(ws);
        setRecentWorkspaces(updatedRecents);

        // Smooth transition into open state
        await new Promise((resolve) => setTimeout(resolve, 150));

        setLifecycleState("OPEN");
        setClosingStage(null);
        setTargetWorkspaceName(null);
        ideEvents.emit("workspace:opened", ws);
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open workspace.";
      console.error("[WorkspaceStore] Failed to open workspace:", err);
      if (lifecycleSeqRef.current === currentSeq) {
        setActiveWorkspace(null);
        WorkspaceService.setLastActiveWorkspace(null);
        setLifecycleState("CLOSED");
        setClosingStage(null);
        setTargetWorkspaceName(null);
        setError(msg);
      }
      return false;
    } finally {
      isTransitioningRef.current = false;
    }
  }, []);

  const openFolder = useCallback(async (): Promise<boolean> => {
    if (isTransitioningRef.current) {
      return false;
    }

    setError(null);
    try {
      const selectedPath = await WorkspaceService.pickFolder();
      if (!selectedPath) {
        return false;
      }

      return await openWorkspacePath(selectedPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open folder.";
      setError(msg);
      return false;
    }
  }, [openWorkspacePath]);

  const removeRecent = useCallback((rootPath: string) => {
    const updated = WorkspaceService.removeRecentWorkspace(rootPath);
    setRecentWorkspaces(updated);
  }, []);

  const clearRecent = useCallback(() => {
    WorkspaceService.clearRecentWorkspaces();
    setRecentWorkspaces([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const addFolderToWorkspace = useCallback(
    async (folderPath?: string): Promise<boolean> => {
      const current = activeWorkspaceRef.current;
      if (!current) return false;

      let targetPath = folderPath;
      if (!targetPath) {
        try {
          const picked = await WorkspaceService.pickFolder();
          if (!picked) return false;
          targetPath = picked;
        } catch (err) {
          console.error("[WorkspaceStore] Failed picking folder to add:", err);
          return false;
        }
      }

      const isValid = await WorkspaceService.validatePath(targetPath);
      if (!isValid) {
        setError(`Selected folder does not exist or cannot be accessed: ${targetPath}`);
        return false;
      }

      const updated = WorkspaceService.addRootFolder(current, targetPath);
      setActiveWorkspace(updated);
      activeWorkspaceRef.current = updated;
      WorkspaceService.setLastActiveWorkspace(updated);

      try {
        await fsWatcher.watch(targetPath);
      } catch (err) {
        console.warn("[WorkspaceStore] Failed watching newly added folder root:", err);
      }

      ideEvents.emit("workspace:changed", {
        id: updated.id,
        name: updated.name,
        rootPath: updated.rootPath,
        roots: updated.roots,
      });

      return true;
    },
    []
  );

  const removeFolderFromWorkspace = useCallback(
    async (rootIdOrPath: string): Promise<boolean> => {
      const current = activeWorkspaceRef.current;
      if (!current || current.roots.length <= 1) return false;

      const rootToRemove = current.roots.find(
        (r) =>
          r.id === rootIdOrPath ||
          normalizePath(r.path).toLowerCase() === normalizePath(rootIdOrPath).toLowerCase()
      );

      if (rootToRemove) {
        try {
          await fsWatcher.unwatch(rootToRemove.path);
        } catch (err) {
          console.warn("[WorkspaceStore] Failed unwatching removed folder root:", err);
        }
      }

      const updated = WorkspaceService.removeRootFolder(current, rootIdOrPath);
      setActiveWorkspace(updated);
      activeWorkspaceRef.current = updated;
      WorkspaceService.setLastActiveWorkspace(updated);

      ideEvents.emit("workspace:changed", {
        id: updated.id,
        name: updated.name,
        rootPath: updated.rootPath,
        roots: updated.roots,
      });

      return true;
    },
    []
  );

  const isMultiRoot = Boolean(activeWorkspace && activeWorkspace.roots && activeWorkspace.roots.length > 1);

  const contextValue = useMemo(
    () => ({
      activeWorkspace,
      recentWorkspaces,
      isLoading,
      error,
      lifecycleState,
      closingStage,
      targetWorkspaceName,
      isMultiRoot,
      openFolder,
      openWorkspacePath,
      closeWorkspace,
      addFolderToWorkspace,
      removeFolderFromWorkspace,
      registerBeforeCloseHook,
      removeRecent,
      clearRecent,
      clearError,
      refreshRecent,
    }),
    [
      activeWorkspace,
      recentWorkspaces,
      isLoading,
      error,
      lifecycleState,
      closingStage,
      targetWorkspaceName,
      isMultiRoot,
      openFolder,
      openWorkspacePath,
      closeWorkspace,
      addFolderToWorkspace,
      removeFolderFromWorkspace,
      registerBeforeCloseHook,
      removeRecent,
      clearRecent,
      clearError,
      refreshRecent,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceOptional() {
  return useContext(WorkspaceContext);
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
