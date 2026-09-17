"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Workspace, RecentWorkspace } from "./types";
import { WorkspaceService } from "./service";
import { ideEvents } from "@/lib/events";

interface WorkspaceContextValue {
  activeWorkspace: Workspace | null;
  recentWorkspaces: RecentWorkspace[];
  isLoading: boolean;
  error: string | null;
  openFolder: () => Promise<boolean>;
  openWorkspacePath: (path: string) => Promise<boolean>;
  closeWorkspace: () => void;
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

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

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
            ideEvents.emit("workspace:opened", restored);
          }
          setRecentWorkspaces(WorkspaceService.getRecentWorkspaces());
        }
      } catch (err) {
        console.error("[WorkspaceStore] Restore error:", err);
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

  const openFolder = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const selectedPath = await WorkspaceService.pickFolder();
      if (!selectedPath) {
        return false;
      }

      const isValid = await WorkspaceService.validatePath(selectedPath);
      if (!isValid) {
        setError("Selected folder does not exist or is not accessible.");
        return false;
      }

      const oldWorkspace = activeWorkspaceRef.current;
      const detectedTypes = await WorkspaceService.detectProjectCharacteristics(selectedPath);
      const ws = WorkspaceService.createWorkspace(selectedPath, detectedTypes);
      const updatedRecents = WorkspaceService.addRecentWorkspace(ws);
      WorkspaceService.setLastActiveWorkspace(ws);

      setActiveWorkspace(ws);
      setRecentWorkspaces(updatedRecents);

      if (oldWorkspace) {
        ideEvents.emit("workspace:switched", { from: oldWorkspace, to: ws });
      }
      ideEvents.emit("workspace:opened", ws);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open folder.";
      setError(msg);
      return false;
    }
  }, []);

  const openWorkspacePath = useCallback(async (rootPath: string): Promise<boolean> => {
    setError(null);
    try {
      const isValid = await WorkspaceService.validatePath(rootPath);
      if (!isValid) {
        const recents = WorkspaceService.getRecentWorkspaces().map((item) =>
          item.rootPath.toLowerCase() === rootPath.toLowerCase() ? { ...item, exists: false } : item
        );
        WorkspaceService.saveRecentWorkspaces(recents);
        setRecentWorkspaces(recents);

        setError(`The directory "${rootPath}" is no longer accessible.`);
        return false;
      }

      const oldWorkspace = activeWorkspaceRef.current;
      const detectedTypes = await WorkspaceService.detectProjectCharacteristics(rootPath);
      const ws = WorkspaceService.createWorkspace(rootPath, detectedTypes);
      const updatedRecents = WorkspaceService.addRecentWorkspace(ws);
      WorkspaceService.setLastActiveWorkspace(ws);

      setActiveWorkspace(ws);
      setRecentWorkspaces(updatedRecents);

      if (oldWorkspace) {
        ideEvents.emit("workspace:switched", { from: oldWorkspace, to: ws });
      }
      ideEvents.emit("workspace:opened", ws);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open workspace.";
      setError(msg);
      return false;
    }
  }, []);

  const closeWorkspace = useCallback(() => {
    setActiveWorkspace(null);
    WorkspaceService.setLastActiveWorkspace(null);
    setRecentWorkspaces(WorkspaceService.getRecentWorkspaces());
    ideEvents.emit("workspace:closed", undefined);
  }, []);

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

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        recentWorkspaces,
        isLoading,
        error,
        openFolder,
        openWorkspacePath,
        closeWorkspace,
        removeRecent,
        clearRecent,
        clearError,
        refreshRecent,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
