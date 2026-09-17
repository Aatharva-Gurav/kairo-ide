"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  FileSystemNode,
  ClipboardOperation,
  InlineAction,
  ExplorerSortConfig,
  ExplorerSortMode,
} from "./types";
import { FileExplorerService } from "./service";
import { useWorkspace } from "../workspace/store";
import { WorkspaceService } from "../workspace/service";
import { ideEvents } from "@/lib/events";
import { dirname, normalizePath, relativePath } from "@/lib/tauri-ipc";

export interface FileExplorerContextValue {
  // Tree & Display Nodes
  nodes: FileSystemNode[];
  displayNodes: FileSystemNode[];
  isLoading: boolean;
  error: string | null;
  showHidden: boolean;
  setShowHidden: (show: boolean) => void;

  // Sorting & Filtering
  sortConfig: ExplorerSortConfig;
  setSortMode: (mode: ExplorerSortMode) => void;
  filterQuery: string;
  setFilterQuery: (query: string) => void;
  matchingCount: number;

  // Selection
  selectedNode: FileSystemNode | null;
  selectedNodes: FileSystemNode[];
  selectedPaths: Set<string>;
  selectNode: (
    node: FileSystemNode | null,
    isCtrlOrMeta?: boolean,
    isShift?: boolean
  ) => void;
  clearSelection: () => void;

  // Expansion
  expandedPaths: Set<string>;
  toggleExpand: (node: FileSystemNode) => Promise<void>;
  collapseAll: () => void;

  // Actions
  openFile: (node: FileSystemNode) => void;
  openToSide: (node: FileSystemNode) => void;
  refresh: (targetPath?: string) => Promise<void>;

  // Inline creation / rename
  inlineAction: InlineAction | null;
  startCreateFile: (parentPath?: string) => void;
  startCreateFolder: (parentPath?: string) => void;
  startRename: (node: FileSystemNode) => void;
  cancelInlineAction: () => void;
  commitInlineAction: (value: string) => Promise<boolean>;

  // Deletion
  deleteCandidate: FileSystemNode | null;
  bulkDeleteCandidate: FileSystemNode[] | null;
  promptDelete: (candidate?: FileSystemNode | FileSystemNode[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<boolean>;

  // Clipboard
  clipboard: ClipboardOperation | null;
  copyNode: (node: FileSystemNode) => void;
  cutNode: (node: FileSystemNode) => void;
  copySelected: (nodes?: FileSystemNode[]) => void;
  cutSelected: (nodes?: FileSystemNode[]) => void;
  pasteNode: (targetNode?: FileSystemNode | null) => Promise<boolean>;
  duplicateNode: (node: FileSystemNode) => Promise<boolean>;

  // Path Utilities
  copyAbsolutePath: (node: FileSystemNode) => Promise<void>;
  copyRelativePath: (node: FileSystemNode) => Promise<void>;
  revealInFileManager: (node: FileSystemNode) => Promise<void>;

  // Drag & Drop & Error
  handleDrop: (sourcePath: string, targetDirPath: string) => Promise<boolean>;
  clearError: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

const FileExplorerContext = createContext<FileExplorerContextValue | null>(null);

/**
 * Recursively updates a node in the tree
 */
function updateNodeInTree(
  nodes: FileSystemNode[],
  targetPath: string,
  updater: (node: FileSystemNode) => FileSystemNode
): FileSystemNode[] {
  const normTarget = normalizePath(targetPath);
  return nodes.map((node) => {
    if (normalizePath(node.path) === normTarget) {
      return updater(node);
    }
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeInTree(node.children, normTarget, updater),
      };
    }
    return node;
  });
}

/**
 * Recursively sorts all levels of the tree
 */
function recursivelySortNodes(
  nodes: FileSystemNode[],
  config: ExplorerSortConfig
): FileSystemNode[] {
  const sorted = FileExplorerService.sortNodes(nodes, config);
  return sorted.map((node) => {
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: recursivelySortNodes(node.children, config),
      };
    }
    return node;
  });
}

/**
 * Flattens visible tree nodes for keyboard navigation and range selection
 */
function getVisibleNodes(
  nodes: FileSystemNode[],
  expandedPaths: Set<string>
): FileSystemNode[] {
  const list: FileSystemNode[] = [];
  for (const node of nodes) {
    list.push(node);
    const isExpanded =
      node.isExpanded || expandedPaths.has(normalizePath(node.path));
    if (node.type === "directory" && isExpanded && node.children) {
      list.push(...getVisibleNodes(node.children, expandedPaths));
    }
  }
  return list;
}

/**
 * Finds all nodes matching given paths in the tree
 */
function findNodesByPaths(
  nodes: FileSystemNode[],
  paths: Set<string>
): FileSystemNode[] {
  const result: FileSystemNode[] = [];
  function search(list: FileSystemNode[]) {
    for (const node of list) {
      if (paths.has(normalizePath(node.path))) {
        result.push(node);
      }
      if (node.children) {
        search(node.children);
      }
    }
  }
  search(nodes);
  return result;
}

async function loadDirectoryRecursiveHelper(
  dirPath: string,
  currentExpanded: Set<string>,
  showHidden: boolean
): Promise<FileSystemNode[]> {
  const items = await FileExplorerService.readDirectory(dirPath, showHidden);
  const populated = await Promise.all(
    items.map(async (item) => {
      const itemNorm = normalizePath(item.path);
      if (item.type === "directory" && currentExpanded.has(itemNorm)) {
        const subChildren = await loadDirectoryRecursiveHelper(itemNorm, currentExpanded, showHidden);
        return {
          ...item,
          isExpanded: true,
          children: subChildren,
        };
      }
      return item;
    })
  );
  return populated;
}

export function FileExplorerProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();

  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<FileSystemNode | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastAnchorNode, setLastAnchorNode] = useState<FileSystemNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipboardOperation | null>(null);
  const [inlineAction, setInlineAction] = useState<InlineAction | null>(null);
  const [bulkDeleteCandidate, setBulkDeleteCandidate] = useState<FileSystemNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<ExplorerSortConfig>({
    mode: "folders-first",
    caseSensitive: false,
  });

  const expandedPathsRef = useRef(expandedPaths);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const selectedNodeRef = useRef(selectedNode);
  const selectedPathsRef = useRef(selectedPaths);
  const nodesRef = useRef(nodes);
  const sortConfigRef = useRef(sortConfig);

  useEffect(() => {
    expandedPathsRef.current = expandedPaths;
    activeWorkspaceRef.current = activeWorkspace;
    selectedNodeRef.current = selectedNode;
    selectedPathsRef.current = selectedPaths;
    nodesRef.current = nodes;
    sortConfigRef.current = sortConfig;
  });

  /**
   * Recursively loads children for all expanded paths.
   */
  const loadDirectoryRecursive = useCallback(
    (dirPath: string, currentExpanded: Set<string>): Promise<FileSystemNode[]> => {
      return loadDirectoryRecursiveHelper(dirPath, currentExpanded, showHidden);
    },
    [showHidden]
  );

  /**
   * Refreshes the explorer tree, preserving expanded folder states.
   */
  const refresh = useCallback(
    async (targetPath?: string) => {
      const ws = activeWorkspaceRef.current;
      if (!ws) {
        setNodes([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (!targetPath || normalizePath(targetPath) === normalizePath(ws.rootPath)) {
          const freshNodes = await loadDirectoryRecursive(ws.rootPath, expandedPathsRef.current);
          setNodes(freshNodes);
        } else {
          const normTarget = normalizePath(targetPath);
          const subChildren = await loadDirectoryRecursive(normTarget, expandedPathsRef.current);
          setNodes((prev) =>
            updateNodeInTree(prev, normTarget, (node) => ({
              ...node,
              children: subChildren,
            }))
          );
        }
        ideEvents.emit("explorer:refreshed", undefined);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to refresh directory.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [loadDirectoryRecursive]
  );

  // Restore workspace state or reset when active workspace changes
  useEffect(() => {
    let isCancelled = false;

    async function initWorkspace() {
      if (!activeWorkspace) {
        setNodes([]);
        setSelectedNode(null);
        setSelectedPaths(new Set());
        setExpandedPaths(new Set());
        setInlineAction(null);
        setBulkDeleteCandidate(null);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      setSelectedNode(null);
      setSelectedPaths(new Set());
      setInlineAction(null);
      setBulkDeleteCandidate(null);

      const savedState = WorkspaceService.getWorkspaceState(activeWorkspace.rootPath);
      const restoredExpanded = savedState?.expandedPaths
        ? new Set(savedState.expandedPaths)
        : new Set<string>();
      const restoredSortMode = (savedState?.sortMode as ExplorerSortMode) || "folders-first";
      const restoredShowHidden = savedState?.showHidden ?? false;

      setExpandedPaths(restoredExpanded);
      setSortConfig({ mode: restoredSortMode, caseSensitive: false });
      setShowHidden(restoredShowHidden);

      try {
        const items = await loadDirectoryRecursive(activeWorkspace.rootPath, restoredExpanded);
        if (!isCancelled) {
          setNodes(items);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to read workspace directory.");
          setNodes([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [activeWorkspace, loadDirectoryRecursive]);

  // Persist workspace state changes
  useEffect(() => {
    if (!activeWorkspace) return;
    WorkspaceService.saveWorkspaceState(activeWorkspace.rootPath, {
      expandedPaths: Array.from(expandedPaths),
      sortMode: sortConfig.mode,
      showHidden,
    });
  }, [activeWorkspace, expandedPaths, sortConfig.mode, showHidden]);

  // Computed display nodes (filtered & sorted)
  const { displayNodes, matchingCount } = useMemo(() => {
    if (!filterQuery.trim()) {
      const sorted = recursivelySortNodes(nodes, sortConfig);
      return { displayNodes: sorted, matchingCount: nodes.length };
    }
    const filtered = FileExplorerService.filterTree(nodes, filterQuery);
    const sorted = recursivelySortNodes(filtered.filteredNodes, sortConfig);
    return { displayNodes: sorted, matchingCount: filtered.matchingCount };
  }, [nodes, filterQuery, sortConfig]);

  // Computed array of currently selected nodes
  const selectedNodes = useMemo(() => {
    if (selectedPaths.size === 0) return [];
    return findNodesByPaths(nodes, selectedPaths);
  }, [nodes, selectedPaths]);

  const toggleExpand = useCallback(
    async (node: FileSystemNode) => {
      if (node.type !== "directory") return;

      const nodePath = normalizePath(node.path);
      const isCurrentlyExpanded = expandedPathsRef.current.has(nodePath);

      if (isCurrentlyExpanded) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(nodePath);
          return next;
        });
        setNodes((prev) =>
          updateNodeInTree(prev, nodePath, (n) => ({
            ...n,
            isExpanded: false,
          }))
        );
      } else {
        setExpandedPaths((prev) => new Set(prev).add(nodePath));
        setNodes((prev) =>
          updateNodeInTree(prev, nodePath, (n) => ({
            ...n,
            isLoading: true,
          }))
        );

        try {
          const children = await FileExplorerService.readDirectory(nodePath, showHidden);
          setNodes((prev) =>
            updateNodeInTree(prev, nodePath, (n) => ({
              ...n,
              isExpanded: true,
              isLoading: false,
              children,
            }))
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to read folder.";
          setError(msg);
          setNodes((prev) =>
            updateNodeInTree(prev, nodePath, (n) => ({
              ...n,
              isLoading: false,
            }))
          );
        }
      }
    },
    [showHidden]
  );

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
    setNodes((prev) => {
      function collapseRecursive(list: FileSystemNode[]): FileSystemNode[] {
        return list.map((n) => ({
          ...n,
          isExpanded: false,
          children: n.children ? collapseRecursive(n.children) : undefined,
        }));
      }
      return collapseRecursive(prev);
    });
    ideEvents.emit("explorer:collapse-all", undefined);
  }, []);

  const selectNode = useCallback(
    (
      node: FileSystemNode | null,
      isCtrlOrMeta = false,
      isShift = false
    ) => {
      if (!node) {
        setSelectedNode(null);
        setSelectedPaths(new Set());
        setLastAnchorNode(null);
        return;
      }

      const nodePath = normalizePath(node.path);

      if (isShift && lastAnchorNode) {
        const visible = getVisibleNodes(displayNodes, expandedPathsRef.current);
        const anchorIdx = visible.findIndex(
          (n) => normalizePath(n.path) === normalizePath(lastAnchorNode.path)
        );
        const targetIdx = visible.findIndex(
          (n) => normalizePath(n.path) === nodePath
        );

        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const range = visible.slice(start, end + 1);
          const nextPaths = new Set(selectedPathsRef.current);
          range.forEach((n) => nextPaths.add(normalizePath(n.path)));

          setSelectedPaths(nextPaths);
          setSelectedNode(node);
          ideEvents.emit("explorer:multi-selected", {
            paths: Array.from(nextPaths),
          });
          return;
        }
      }

      if (isCtrlOrMeta) {
        const nextPaths = new Set(selectedPathsRef.current);
        if (nextPaths.has(nodePath)) {
          nextPaths.delete(nodePath);
          setSelectedPaths(nextPaths);
          if (selectedNodeRef.current && normalizePath(selectedNodeRef.current.path) === nodePath) {
            const first = Array.from(nextPaths)[0];
            const found = first
              ? findNodesByPaths(nodesRef.current, new Set([first]))[0] || null
              : null;
            setSelectedNode(found);
          }
        } else {
          nextPaths.add(nodePath);
          setSelectedPaths(nextPaths);
          setSelectedNode(node);
          setLastAnchorNode(node);
        }

        ideEvents.emit("explorer:multi-selected", {
          paths: Array.from(nextPaths),
        });
        return;
      }

      // Normal single selection
      setSelectedPaths(new Set([nodePath]));
      setSelectedNode(node);
      setLastAnchorNode(node);

      ideEvents.emit("file:selected", {
        path: node.path,
        name: node.name,
        isDirectory: node.type === "directory",
        size: node.size,
        modifiedAt: node.modifiedAt,
      });
    },
    [displayNodes, lastAnchorNode]
  );

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedPaths(new Set());
    setLastAnchorNode(null);
  }, []);

  const openFile = useCallback(
    (node: FileSystemNode) => {
      if (node.type === "directory") {
        toggleExpand(node);
      } else {
        selectNode(node);
        ideEvents.emit("file:open-requested", {
          path: node.path,
          name: node.name,
          isDirectory: false,
          size: node.size,
          modifiedAt: node.modifiedAt,
        });
      }
    },
    [toggleExpand, selectNode]
  );

  const openToSide = useCallback((node: FileSystemNode) => {
    if (node.type === "directory") return;
    ideEvents.emit("file:open-to-side", {
      path: node.path,
      name: node.name,
      isDirectory: false,
      size: node.size,
      modifiedAt: node.modifiedAt,
    });
  }, []);

  const setSortMode = useCallback((mode: ExplorerSortMode) => {
    setSortConfig((prev) => ({ ...prev, mode }));
  }, []);

  const startCreateFile = useCallback((parentPath?: string) => {
    const ws = activeWorkspaceRef.current;
    if (!ws) return;

    let targetParent = ws.rootPath;
    if (parentPath) {
      targetParent = parentPath;
    } else if (selectedNodeRef.current) {
      targetParent =
        selectedNodeRef.current.type === "directory"
          ? selectedNodeRef.current.path
          : dirname(selectedNodeRef.current.path);
    }

    const targetNorm = normalizePath(targetParent);
    if (targetNorm !== normalizePath(ws.rootPath)) {
      setExpandedPaths((prev) => new Set(prev).add(targetNorm));
    }

    setInlineAction({
      type: "create-file",
      parentPath: targetNorm,
    });
  }, []);

  const startCreateFolder = useCallback((parentPath?: string) => {
    const ws = activeWorkspaceRef.current;
    if (!ws) return;

    let targetParent = ws.rootPath;
    if (parentPath) {
      targetParent = parentPath;
    } else if (selectedNodeRef.current) {
      targetParent =
        selectedNodeRef.current.type === "directory"
          ? selectedNodeRef.current.path
          : dirname(selectedNodeRef.current.path);
    }

    const targetNorm = normalizePath(targetParent);
    if (targetNorm !== normalizePath(ws.rootPath)) {
      setExpandedPaths((prev) => new Set(prev).add(targetNorm));
    }

    setInlineAction({
      type: "create-folder",
      parentPath: targetNorm,
    });
  }, []);

  const startRename = useCallback((node: FileSystemNode) => {
    setInlineAction({
      type: "rename",
      parentPath: dirname(node.path),
      targetNodeId: node.id,
      initialValue: node.name,
    });
  }, []);

  const cancelInlineAction = useCallback(() => {
    setInlineAction(null);
  }, []);

  const commitInlineAction = useCallback(
    async (value: string): Promise<boolean> => {
      if (!inlineAction) return false;
      const cleanValue = value.trim();
      if (!cleanValue) {
        setInlineAction(null);
        return false;
      }

      setError(null);

      try {
        if (inlineAction.type === "create-file") {
          const newFilePath = await FileExplorerService.createFile(
            inlineAction.parentPath,
            cleanValue
          );
          await refresh(inlineAction.parentPath);
          ideEvents.emit("file:created", {
            path: newFilePath,
            name: cleanValue,
            isDirectory: false,
          });
        } else if (inlineAction.type === "create-folder") {
          await FileExplorerService.createDirectory(
            inlineAction.parentPath,
            cleanValue
          );
          await refresh(inlineAction.parentPath);
        } else if (inlineAction.type === "rename" && inlineAction.targetNodeId) {
          const targetNorm = normalizePath(inlineAction.targetNodeId);
          const newPath = await FileExplorerService.rename(targetNorm, cleanValue);
          await refresh(inlineAction.parentPath);

          ideEvents.emit("file:renamed", {
            oldPath: targetNorm,
            newPath,
            isDirectory: selectedNodeRef.current?.type === "directory",
          });

          if (
            selectedNodeRef.current &&
            normalizePath(selectedNodeRef.current.path) === targetNorm
          ) {
            setSelectedNode((prev) =>
              prev ? { ...prev, name: cleanValue, path: newPath } : null
            );
          }
        }

        setInlineAction(null);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Operation failed.";
        setError(msg);
        return false;
      }
    },
    [inlineAction, refresh]
  );

  const promptDelete = useCallback(
    (candidate?: FileSystemNode | FileSystemNode[]) => {
      if (Array.isArray(candidate)) {
        setBulkDeleteCandidate(candidate);
      } else if (candidate) {
        const candidateNorm = normalizePath(candidate.path);
        if (
          selectedPathsRef.current.size > 1 &&
          selectedPathsRef.current.has(candidateNorm)
        ) {
          const selected = findNodesByPaths(
            nodesRef.current,
            selectedPathsRef.current
          );
          setBulkDeleteCandidate(selected);
        } else {
          setBulkDeleteCandidate([candidate]);
        }
      } else if (selectedPathsRef.current.size > 0) {
        const selected = findNodesByPaths(
          nodesRef.current,
          selectedPathsRef.current
        );
        setBulkDeleteCandidate(selected);
      }
    },
    []
  );

  const cancelDelete = useCallback(() => {
    setBulkDeleteCandidate(null);
  }, []);

  const confirmDelete = useCallback(async (): Promise<boolean> => {
    if (!bulkDeleteCandidate || bulkDeleteCandidate.length === 0) return false;
    setError(null);

    try {
      const parentsToRefresh = new Set<string>();
      for (const node of bulkDeleteCandidate) {
        parentsToRefresh.add(dirname(node.path));
      }

      await FileExplorerService.bulkDelete(bulkDeleteCandidate);

      for (const parent of parentsToRefresh) {
        await refresh(parent);
      }

      setSelectedPaths(new Set());
      setSelectedNode(null);
      setLastAnchorNode(null);

      for (const node of bulkDeleteCandidate) {
        ideEvents.emit("file:deleted", {
          path: node.path,
          isDirectory: node.type === "directory",
        });
      }

      setBulkDeleteCandidate(null);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete item(s).";
      setError(msg);
      return false;
    }
  }, [bulkDeleteCandidate, refresh]);

  const copySelected = useCallback(
    (targetNodes?: FileSystemNode[]) => {
      const targets =
        targetNodes ||
        (selectedPathsRef.current.size > 0
          ? findNodesByPaths(nodesRef.current, selectedPathsRef.current)
          : selectedNodeRef.current
          ? [selectedNodeRef.current]
          : []);

      if (targets.length === 0) return;
      setClipboard({ sourceNodes: targets, type: "copy" });
    },
    []
  );

  const cutSelected = useCallback(
    (targetNodes?: FileSystemNode[]) => {
      const targets =
        targetNodes ||
        (selectedPathsRef.current.size > 0
          ? findNodesByPaths(nodesRef.current, selectedPathsRef.current)
          : selectedNodeRef.current
          ? [selectedNodeRef.current]
          : []);

      if (targets.length === 0) return;
      setClipboard({ sourceNodes: targets, type: "cut" });
    },
    []
  );

  const copyNode = useCallback((node: FileSystemNode) => {
    setClipboard({ sourceNodes: [node], type: "copy" });
  }, []);

  const cutNode = useCallback((node: FileSystemNode) => {
    setClipboard({ sourceNodes: [node], type: "cut" });
  }, []);

  const pasteNode = useCallback(
    async (targetNode?: FileSystemNode | null): Promise<boolean> => {
      if (!clipboard || clipboard.sourceNodes.length === 0) return false;
      const ws = activeWorkspaceRef.current;
      if (!ws) return false;

      setError(null);

      let targetDir = ws.rootPath;
      if (targetNode) {
        targetDir =
          targetNode.type === "directory" ? targetNode.path : dirname(targetNode.path);
      } else if (selectedNodeRef.current) {
        targetDir =
          selectedNodeRef.current.type === "directory"
            ? selectedNodeRef.current.path
            : dirname(selectedNodeRef.current.path);
      }

      const targetNorm = normalizePath(targetDir);

      try {
        if (clipboard.type === "copy") {
          await FileExplorerService.bulkCopy(clipboard.sourceNodes, targetNorm);
          await refresh(targetNorm);
          for (const src of clipboard.sourceNodes) {
            ideEvents.emit("file:copied", {
              sourcePath: src.path,
              destPath: `${targetNorm}/${src.name}`,
            });
          }
        } else if (clipboard.type === "cut") {
          const sourceParents = new Set<string>();
          for (const src of clipboard.sourceNodes) {
            sourceParents.add(dirname(src.path));
          }

          await FileExplorerService.bulkMove(clipboard.sourceNodes, targetNorm);
          await refresh(targetNorm);
          for (const p of sourceParents) {
            if (normalizePath(p) !== targetNorm) {
              await refresh(p);
            }
          }

          for (const src of clipboard.sourceNodes) {
            ideEvents.emit("file:moved", {
              sourcePath: src.path,
              destPath: `${targetNorm}/${src.name}`,
              isDirectory: src.type === "directory",
            });
          }
          setClipboard(null);
        }
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to paste item(s).";
        setError(msg);
        return false;
      }
    },
    [clipboard, refresh]
  );

  const duplicateNode = useCallback(
    async (node: FileSystemNode): Promise<boolean> => {
      setError(null);
      try {
        const newPath = await FileExplorerService.duplicate(node.path);
        const parent = dirname(node.path);
        await refresh(parent);
        ideEvents.emit("file:copied", { sourcePath: node.path, destPath: newPath });
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to duplicate item.";
        setError(msg);
        return false;
      }
    },
    [refresh]
  );

  const copyAbsolutePath = useCallback(async (node: FileSystemNode) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(node.path);
      }
    } catch (e) {
      console.error("Failed to copy absolute path:", e);
    }
  }, []);

  const copyRelativePath = useCallback(async (node: FileSystemNode) => {
    const ws = activeWorkspaceRef.current;
    if (!ws) return;
    try {
      const rel = relativePath(ws.rootPath, node.path);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(rel);
      }
    } catch (e) {
      console.error("Failed to copy relative path:", e);
    }
  }, []);

  const revealInFileManager = useCallback(async (node: FileSystemNode) => {
    try {
      await FileExplorerService.reveal(node.path);
    } catch (e) {
      console.error("Failed to reveal file in file manager:", e);
    }
  }, []);

  const handleDrop = useCallback(
    async (sourcePath: string, targetDirPath: string): Promise<boolean> => {
      setError(null);
      try {
        const normSrc = normalizePath(sourcePath);
        const normDest = normalizePath(targetDirPath);
        const sourceParent = dirname(normSrc);

        const newPath = await FileExplorerService.move(normSrc, normDest);
        await refresh(normDest);
        if (normalizePath(sourceParent) !== normDest) {
          await refresh(sourceParent);
        }

        ideEvents.emit("file:moved", {
          sourcePath: normSrc,
          destPath: newPath,
          isDirectory: false,
        });

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to move item.";
        setError(msg);
        return false;
      }
    },
    [refresh]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (inlineAction) return;

      const visible = getVisibleNodes(displayNodes, expandedPathsRef.current);
      if (visible.length === 0) return;

      const currentIndex = selectedNodeRef.current
        ? visible.findIndex(
            (n) =>
              normalizePath(n.path) ===
              normalizePath(selectedNodeRef.current!.path)
          )
        : -1;

      // Select all visible (Ctrl/Cmd + A)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const allPaths = new Set(visible.map((n) => normalizePath(n.path)));
        setSelectedPaths(allPaths);
        if (visible[0]) {
          setSelectedNode(visible[0]);
          setLastAnchorNode(visible[0]);
        }
        ideEvents.emit("explorer:multi-selected", {
          paths: Array.from(allPaths),
        });
        return;
      }

      // Copy selected (Ctrl/Cmd + C)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
        return;
      }

      // Cut selected (Ctrl/Cmd + X)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelected();
        return;
      }

      // Paste into selected or root (Ctrl/Cmd + V)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteNode(selectedNodeRef.current);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          currentIndex < visible.length - 1 ? currentIndex + 1 : 0;
        selectNode(visible[nextIndex], e.ctrlKey || e.metaKey, e.shiftKey);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          currentIndex > 0 ? currentIndex - 1 : visible.length - 1;
        selectNode(visible[prevIndex], e.ctrlKey || e.metaKey, e.shiftKey);
      } else if (e.key === "ArrowRight") {
        if (
          selectedNodeRef.current &&
          selectedNodeRef.current.type === "directory"
        ) {
          e.preventDefault();
          if (!expandedPathsRef.current.has(normalizePath(selectedNodeRef.current.path))) {
            toggleExpand(selectedNodeRef.current);
          }
        }
      } else if (e.key === "ArrowLeft") {
        if (selectedNodeRef.current) {
          e.preventDefault();
          if (
            selectedNodeRef.current.type === "directory" &&
            expandedPathsRef.current.has(normalizePath(selectedNodeRef.current.path))
          ) {
            toggleExpand(selectedNodeRef.current);
          } else {
            const parentPath = dirname(selectedNodeRef.current.path);
            const parentNode = visible.find(
              (n) => normalizePath(n.path) === normalizePath(parentPath)
            );
            if (parentNode) {
              selectNode(parentNode);
            }
          }
        }
      } else if (e.key === "Enter") {
        if (selectedNodeRef.current) {
          e.preventDefault();
          openFile(selectedNodeRef.current);
        }
      } else if (e.key === "F2") {
        if (selectedNodeRef.current) {
          e.preventDefault();
          startRename(selectedNodeRef.current);
        }
      } else if (e.key === "Delete") {
        if (selectedPathsRef.current.size > 0 || selectedNodeRef.current) {
          e.preventDefault();
          promptDelete();
        }
      } else if (e.key === "Escape") {
        clearSelection();
      }
    },
    [
      inlineAction,
      displayNodes,
      selectNode,
      toggleExpand,
      openFile,
      startRename,
      promptDelete,
      copySelected,
      cutSelected,
      pasteNode,
      clearSelection,
    ]
  );

  return (
    <FileExplorerContext.Provider
      value={{
        nodes,
        displayNodes,
        isLoading,
        error,
        showHidden,
        setShowHidden,
        sortConfig,
        setSortMode,
        filterQuery,
        setFilterQuery,
        matchingCount,
        selectedNode,
        selectedNodes,
        selectedPaths,
        selectNode,
        clearSelection,
        expandedPaths,
        toggleExpand,
        collapseAll,
        openFile,
        openToSide,
        refresh,
        inlineAction,
        startCreateFile,
        startCreateFolder,
        startRename,
        cancelInlineAction,
        commitInlineAction,
        deleteCandidate: bulkDeleteCandidate?.[0] ?? null,
        bulkDeleteCandidate,
        promptDelete,
        cancelDelete,
        confirmDelete,
        clipboard,
        copyNode,
        cutNode,
        copySelected,
        cutSelected,
        pasteNode,
        duplicateNode,
        copyAbsolutePath,
        copyRelativePath,
        revealInFileManager,
        handleDrop,
        clearError,
        handleKeyDown,
      }}
    >
      {children}
    </FileExplorerContext.Provider>
  );
}

export function useFileExplorer() {
  const context = useContext(FileExplorerContext);
  if (!context) {
    throw new Error("useFileExplorer must be used within a FileExplorerProvider");
  }
  return context;
}
