"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { FileSystemNode } from "../types";
import { normalizePath, isDescendant, dirname } from "@/lib/tauri-ipc";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  X,
  Search,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";
import { FileExplorerService } from "../service";
import { directoryCache } from "../cache";

interface DirectoryPickerNodeProps {
  node: FileSystemNode;
  depth: number;
  selectedDir: string;
  onSelectDir: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  invalidPaths: Set<string>;
  filterQuery: string;
  subDirMap: Map<string, FileSystemNode[]>;
  loadingPaths: Set<string>;
}

function DirectoryPickerNode({
  node,
  depth,
  selectedDir,
  onSelectDir,
  expandedDirs,
  onToggleExpand,
  invalidPaths,
  filterQuery,
  subDirMap,
  loadingPaths,
}: DirectoryPickerNodeProps) {
  if (node.type !== "directory") return null;

  const nodeNorm = normalizePath(node.path);
  const isExpanded = expandedDirs.has(nodeNorm);
  const isSelected = selectedDir === nodeNorm;
  const isInvalid = invalidPaths.has(nodeNorm);
  const isLoading = loadingPaths.has(nodeNorm);

  const cachedSubDirs = subDirMap.get(nodeNorm);
  const nodeChildrenDirs = (node.children || []).filter((c) => c.type === "directory");
  const memCached = (directoryCache.get(nodeNorm) || []).filter((c) => c.type === "directory");

  const subDirectories =
    cachedSubDirs !== undefined
      ? cachedSubDirs
      : nodeChildrenDirs.length > 0
      ? nodeChildrenDirs
      : memCached;

  const hasLoaded = cachedSubDirs !== undefined || nodeChildrenDirs.length > 0 || directoryCache.get(nodeNorm) !== null;
  const hasSubDirs = subDirectories.length > 0;
  const canExpand = !hasLoaded || hasSubDirs;

  // If filtering, hide if neither node nor descendants match
  if (filterQuery.trim()) {
    const q = filterQuery.toLowerCase();
    const matchesSelf = node.name.toLowerCase().includes(q);
    const hasMatchingDescendant = (children: FileSystemNode[]): boolean =>
      children.some(
        (c) =>
          c.type === "directory" &&
          (c.name.toLowerCase().includes(q) ||
            hasMatchingDescendant(
              subDirMap.get(normalizePath(c.path)) ||
                (c.children || []).filter((ch) => ch.type === "directory")
            ))
      );
    if (!matchesSelf && !hasMatchingDescendant(subDirectories)) {
      return null;
    }
  }

  return (
    <div className="flex flex-col select-none">
      <div
        onClick={() => {
          if (!isInvalid) {
            onSelectDir(nodeNorm);
            if (!isExpanded && canExpand) {
              onToggleExpand(nodeNorm);
            }
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isInvalid && canExpand) {
            onToggleExpand(nodeNorm);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={cn(
          "group flex h-7 items-center gap-1.5 pr-2.5 text-xs rounded-lg transition-colors duration-100 cursor-pointer",
          isInvalid
            ? "opacity-35 cursor-not-allowed text-muted-foreground"
            : isSelected
            ? "bg-accent text-accent-foreground font-medium"
            : "hover:bg-muted/60 text-foreground/90"
        )}
      >
        {canExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(nodeNorm);
            }}
            className="flex size-4 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded transition-colors"
          >
            {isLoading ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight
                className={cn(
                  "size-3 transition-transform duration-140",
                  isExpanded && "rotate-90"
                )}
              />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <FileIcon
          name={node.name}
          isDirectory={true}
          isExpanded={isExpanded}
          className="w-[17px] h-[13.5px] shrink-0"
        />

        <span className="truncate flex-1 text-xs leading-normal font-sans">
          {node.name}
        </span>

        {isSelected && (
          <Check className="size-3.5 text-primary shrink-0" />
        )}

        {isInvalid && (
          <span className="text-[10px] text-muted-foreground/70 italic shrink-0">
            Current
          </span>
        )}
      </div>

      {isExpanded && subDirectories.length > 0 && (
        <div className="flex flex-col space-y-0.5">
          {subDirectories.map((child) => (
            <DirectoryPickerNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedDir={selectedDir}
              onSelectDir={onSelectDir}
              expandedDirs={expandedDirs}
              onToggleExpand={onToggleExpand}
              invalidPaths={invalidPaths}
              filterQuery={filterQuery}
              subDirMap={subDirMap}
              loadingPaths={loadingPaths}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoveItemsModal() {
  const { moveCandidates, closeMove, moveSelectedTo, nodes, showHidden } = useFileExplorer();
  const { activeWorkspace } = useWorkspace();

  const candidates = moveCandidates;
  const isOpen = candidates !== null && candidates.length > 0;

  const [selectedDir, setSelectedDir] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [subDirMap, setSubDirMap] = useState<Map<string, FileSystemNode[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [isMoving, setIsMoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const subDirMapRef = useRef(subDirMap);
  const loadingPathsRef = useRef(loadingPaths);
  subDirMapRef.current = subDirMap;
  loadingPathsRef.current = loadingPaths;

  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;

  const loadSubDirsFor = useCallback(
    async (dirPath: string) => {
      const norm = normalizePath(dirPath);
      if (loadingPathsRef.current.has(norm) || subDirMapRef.current.has(norm)) return;

      loadingPathsRef.current = new Set(loadingPathsRef.current).add(norm);
      setLoadingPaths(loadingPathsRef.current);
      try {
        const entries = await FileExplorerService.readDirectory(norm, showHiddenRef.current);
        const dirs = entries.filter((e) => e.type === "directory");
        subDirMapRef.current = new Map(subDirMapRef.current).set(norm, dirs);
        setSubDirMap(subDirMapRef.current);
      } catch (err) {
        console.error("Failed to load subdirectories for", norm, err);
      } finally {
        const next = new Set(loadingPathsRef.current);
        next.delete(norm);
        loadingPathsRef.current = next;
        setLoadingPaths(next);
      }
    },
    []
  );

  const prevOpenRef = useRef(false);

  // Initialize selectedDir and load subdirectories when opened
  useEffect(() => {
    if (activeWorkspace && isOpen) {
      if (!prevOpenRef.current) {
        prevOpenRef.current = true;
        const rootNorm = normalizePath(activeWorkspace.rootPath);
        setSelectedDir(rootNorm);
        setExpandedDirs(new Set([rootNorm]));
        loadSubDirsFor(rootNorm);
      }
    } else {
      prevOpenRef.current = false;
      setFilterQuery("");
      setErrorMsg(null);
    }
  }, [activeWorkspace, isOpen, loadSubDirsFor]);

  // Compute invalid destination directories (self, descendants, or current parent)
  const invalidPaths = useMemo(() => {
    const set = new Set<string>();
    if (!candidates) return set;

    for (const c of candidates) {
      const cNorm = normalizePath(c.path);
      set.add(cNorm);

      // Current parent directory is an invalid move (already there)
      const parent = normalizePath(dirname(c.path));
      if (candidates.length === 1) {
        set.add(parent);
      }
    }

    // Helper to find all descendants of candidate directories
    function markDescendants(nodeList: FileSystemNode[]) {
      for (const n of nodeList) {
        const nNorm = normalizePath(n.path);
        for (const c of candidates || []) {
          if (c.type === "directory" && (isDescendant(c.path, n.path) || nNorm === normalizePath(c.path))) {
            set.add(nNorm);
          }
        }
        if (n.children) {
          markDescendants(n.children);
        }
      }
    }
    markDescendants(nodes);
    return set;
  }, [candidates, nodes]);

  const toggleExpand = useCallback(
    (dirPath: string) => {
      const norm = normalizePath(dirPath);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(norm)) {
          next.delete(norm);
        } else {
          next.add(norm);
        }
        return next;
      });

      if (!subDirMapRef.current.has(norm)) {
        loadSubDirsFor(norm);
      }
    },
    [loadSubDirsFor]
  );

  const handleConfirmMove = async () => {
    if (!selectedDir || !candidates || invalidPaths.has(selectedDir) || isMoving) return;
    setIsMoving(true);
    setErrorMsg(null);
    try {
      const ok = await moveSelectedTo(selectedDir, candidates);
      if (ok) {
        closeMove();
      } else {
        setErrorMsg("Failed to move items. Destination might be identical or unwritable.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to move items.";
      setErrorMsg(msg);
    } finally {
      setIsMoving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMove();
      } else if (e.key === "Enter") {
        if (selectedDir && !invalidPaths.has(selectedDir) && !isMoving) {
          e.preventDefault();
          handleConfirmMove();
        }
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, closeMove, selectedDir, invalidPaths, isMoving]);

  if (!isOpen || !candidates || !activeWorkspace || typeof document === "undefined") {
    return null;
  }

  const rootNorm = normalizePath(activeWorkspace.rootPath);
  const isRootSelected = selectedDir === rootNorm;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-popover/98 dark:bg-[#1a1a1a]/98 p-3.5 shadow-2xl backdrop-blur-md text-popover-foreground animate-in zoom-in-95 duration-150 ease-out flex flex-col max-h-[82vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-modal-title"
      >
        {/* Notion-style Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span id="move-modal-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Move to
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent text-[11px] font-medium text-accent-foreground truncate max-w-[240px]">
              {candidates.length === 1 ? candidates[0].name : `${candidates.length} items`}
            </span>
          </div>
          <button
            onClick={closeMove}
            title="Close (Esc)"
            className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative mt-2.5 mb-1.5 shrink-0">
          <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search destination folder..."
            className="w-full h-8 pl-8 pr-7 rounded-md bg-muted/40 border border-input/60 text-xs text-foreground placeholder:text-muted-foreground/60 focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-sans"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-1.5 p-2 rounded-md bg-destructive/10 text-destructive text-xs flex items-center gap-2 shrink-0 border border-destructive/20">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
        )}

        {/* Notion-style Folder Tree Browser */}
        <div className="flex-1 min-h-[180px] max-h-[300px] overflow-y-auto rounded-md border border-border/60 bg-background/50 p-1.5 my-1.5 space-y-0.5">
          {/* Root Workspace Folder Item */}
          <div
            onClick={() => setSelectedDir(rootNorm)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              toggleExpand(rootNorm);
            }}
            className={cn(
              "flex h-7 items-center gap-1.5 px-2 text-xs rounded-md transition-colors duration-100 cursor-pointer select-none",
              isRootSelected
                ? "bg-accent text-accent-foreground font-medium"
                : "hover:bg-muted/60 text-foreground/90"
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(rootNorm);
              }}
              className="flex size-4 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded transition-colors"
            >
              {loadingPaths.has(rootNorm) ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : (
                <ChevronRight
                  className={cn(
                    "size-3 transition-transform duration-140",
                    expandedDirs.has(rootNorm) && "rotate-90"
                  )}
                />
              )}
            </button>
            <FileIcon
              name={activeWorkspace.name}
              isDirectory={true}
              isExpanded={expandedDirs.has(rootNorm)}
              className="w-[17px] h-[13.5px] shrink-0"
            />
            <span className="truncate flex-1 text-xs">
              {activeWorkspace.name}{" "}
              <span className="text-[10px] text-muted-foreground font-normal">(Root)</span>
            </span>
            {isRootSelected && <Check className="size-3.5 text-primary shrink-0" />}
          </div>

          {/* Child Folders in Tree */}
          {expandedDirs.has(rootNorm) && (
            <div className="space-y-0.5 pt-0.5">
              {(subDirMap.get(rootNorm) || nodes.filter((n) => n.type === "directory")).map((dirNode) => (
                <DirectoryPickerNode
                  key={dirNode.path}
                  node={dirNode}
                  depth={1}
                  selectedDir={selectedDir}
                  onSelectDir={setSelectedDir}
                  expandedDirs={expandedDirs}
                  onToggleExpand={toggleExpand}
                  invalidPaths={invalidPaths}
                  filterQuery={filterQuery}
                  subDirMap={subDirMap}
                  loadingPaths={loadingPaths}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notion-style Minimal Footer */}
        <div className="pt-2.5 flex items-center justify-between border-t border-border/50 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono">↵</kbd>
            <span>Move</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono ml-1.5">esc</kbd>
            <span>Cancel</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeMove}
              disabled={isMoving}
              className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmMove}
              disabled={!selectedDir || invalidPaths.has(selectedDir) || isMoving}
              className="h-7 px-3 text-xs rounded-md font-medium cursor-pointer shadow-2xs"
            >
              {isMoving ? "Moving..." : "Move"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

