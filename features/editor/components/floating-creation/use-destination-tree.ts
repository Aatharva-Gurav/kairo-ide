"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DestinationFolder } from "./types";
import { FileExplorerService } from "@/features/file-explorer/service";
import { FileSystemNode } from "@/features/file-explorer/types";
import { normalizePath, joinPath } from "@/lib/tauri-ipc";

interface UseDestinationTreeProps {
  workspaceRootPath: string;
  workspaceName: string;
  explorerNodes: FileSystemNode[];
  isOpen: boolean;
}

/**
 * Extracts directory nodes from FileSystemNode hierarchy
 */
function extractDirectories(nodeList: FileSystemNode[], depth = 1): DestinationFolder[] {
  return nodeList
    .filter((n) => n.type === "directory")
    .map((n) => {
      const norm = normalizePath(n.path);
      return {
        id: norm,
        name: n.name,
        path: norm,
        parentPath: n.parentPath,
        depth,
        children: n.children && n.children.length > 0 ? extractDirectories(n.children, depth + 1) : undefined,
        isLoaded: Boolean(n.children && n.children.length > 0),
      };
    });
}

/**
 * Recursively updates a folder node in tree
 */
function updateFolderInTree(
  folders: DestinationFolder[],
  targetPath: string,
  updater: (folder: DestinationFolder) => DestinationFolder
): DestinationFolder[] {
  const normTarget = normalizePath(targetPath).toLowerCase();
  return folders.map((folder) => {
    if (normalizePath(folder.path).toLowerCase() === normTarget) {
      return updater(folder);
    }
    if (folder.children && folder.children.length > 0) {
      return {
        ...folder,
        children: updateFolderInTree(folder.children, targetPath, updater),
      };
    }
    return folder;
  });
}

export function useDestinationTree({
  workspaceRootPath,
  workspaceName,
  explorerNodes,
  isOpen,
}: UseDestinationTreeProps) {
  const normRoot = useMemo(() => normalizePath(workspaceRootPath), [workspaceRootPath]);

  const [selectedPath, setSelectedPath] = useState<string>(normRoot);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([normRoot]));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const [folderTree, setFolderTree] = useState<DestinationFolder[]>([]);

  const activeRootRef = useRef(normRoot);
  activeRootRef.current = normRoot;

  // Sync / initialize tree when workspace changes or menu opens
  useEffect(() => {
    if (!normRoot || !isOpen) return;

    let isCancelled = false;

    // Reset selection to root when opened if current selection is invalid or empty
    setSelectedPath((prev) => {
      if (!prev || !prev.toLowerCase().startsWith(normRoot.toLowerCase())) {
        return normRoot;
      }
      return prev;
    });

    // Seed from explorerNodes if available
    const initialDirs = extractDirectories(explorerNodes, 1);
    if (initialDirs.length > 0) {
      setFolderTree(initialDirs);
    } else {
      // Fetch root directory
      FileExplorerService.readDirectory(normRoot, false)
        .then((entries) => {
          if (isCancelled || activeRootRef.current !== normRoot) return;
          const rootDirs: DestinationFolder[] = entries
            .filter((e) => e.type === "directory")
            .map((e) => {
              const norm = normalizePath(e.path);
              return {
                id: norm,
                name: e.name,
                path: norm,
                parentPath: normRoot,
                depth: 1,
                isLoaded: false,
              };
            });
          setFolderTree(rootDirs);
        })
        .catch(() => {
          if (!isCancelled) setFolderTree([]);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [normRoot, isOpen, explorerNodes]);

  // Expand / collapse folder toggle
  const toggleExpand = useCallback(
    async (folderPath: string) => {
      const norm = normalizePath(folderPath);

      if (expandedPaths.has(norm)) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(norm);
          return next;
        });
        return;
      }

      // Expanding: Add to expanded set
      setExpandedPaths((prev) => new Set(prev).add(norm));

      // Check if folder children need loading
      setLoadingPaths((prev) => new Set(prev).add(norm));
      try {
        const entries = await FileExplorerService.readDirectory(norm, false);
        const childDirs: DestinationFolder[] = entries
          .filter((e) => e.type === "directory")
          .map((e) => {
            const childNorm = normalizePath(e.path);
            return {
              id: childNorm,
              name: e.name,
              path: childNorm,
              parentPath: norm,
              depth: 1, // Depth is adjusted during rendering
              isLoaded: false,
            };
          });

        setFolderTree((prev) =>
          updateFolderInTree(prev, norm, (folder) => ({
            ...folder,
            children: childDirs,
            isLoaded: true,
          }))
        );
      } catch (err) {
        console.warn("[FloatingCreation] Failed to read subfolder:", err);
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(norm);
          return next;
        });
      }
    },
    [expandedPaths]
  );

  // Filtered folders
  const filteredTree = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return folderTree;

    function filterRecursive(folders: DestinationFolder[]): DestinationFolder[] {
      const result: DestinationFolder[] = [];
      for (const f of folders) {
        const matchesSelf = f.name.toLowerCase().includes(q);
        const matchingChildren = f.children ? filterRecursive(f.children) : [];
        if (matchesSelf || matchingChildren.length > 0) {
          result.push({
            ...f,
            children: matchingChildren.length > 0 ? matchingChildren : f.children,
          });
        }
      }
      return result;
    }

    return filterRecursive(folderTree);
  }, [folderTree, filterQuery]);

  // When filtering, auto-expand matching ancestor folders
  useEffect(() => {
    if (!filterQuery.trim()) return;
    const q = filterQuery.toLowerCase();
    const toExpand = new Set<string>();

    function collectMatchingAncestors(folders: DestinationFolder[]) {
      for (const f of folders) {
        const norm = normalizePath(f.path);
        if (f.name.toLowerCase().includes(q) && f.parentPath) {
          toExpand.add(normalizePath(f.parentPath));
        }
        if (f.children && f.children.length > 0) {
          collectMatchingAncestors(f.children);
        }
      }
    }

    collectMatchingAncestors(folderTree);
    if (toExpand.size > 0) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        toExpand.forEach((p) => next.add(p));
        return next;
      });
    }
  }, [filterQuery, folderTree]);

  return {
    normRoot,
    selectedPath,
    setSelectedPath,
    expandedPaths,
    loadingPaths,
    filterQuery,
    setFilterQuery,
    filteredTree,
    toggleExpand,
  };
}

