"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { FileSystemNode } from "../types";
import { normalizePath, isDescendant, dirname } from "@/lib/tauri-ipc";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import {
  FolderOpen,
  ChevronRight,
  X,
  Search,
  Move,
  AlertCircle,
} from "lucide-react";

interface DirectoryPickerNodeProps {
  node: FileSystemNode;
  depth: number;
  selectedDir: string;
  onSelectDir: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  invalidPaths: Set<string>;
  filterQuery: string;
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
}: DirectoryPickerNodeProps) {
  if (node.type !== "directory") return null;

  const nodeNorm = normalizePath(node.path);
  const isExpanded = expandedDirs.has(nodeNorm);
  const isSelected = selectedDir === nodeNorm;
  const isInvalid = invalidPaths.has(nodeNorm);

  const subDirectories = (node.children || []).filter(
    (c) => c.type === "directory"
  );

  // If filtering, hide if neither node nor descendants match
  if (filterQuery.trim()) {
    const q = filterQuery.toLowerCase();
    const matchesSelf = node.name.toLowerCase().includes(q);
    const hasMatchingDescendant = (children: FileSystemNode[]): boolean =>
      children.some(
        (c) =>
          c.type === "directory" &&
          (c.name.toLowerCase().includes(q) ||
            (c.children && hasMatchingDescendant(c.children)))
      );
    if (!matchesSelf && !hasMatchingDescendant(subDirectories)) {
      return null;
    }
  }

  return (
    <div className="flex flex-col select-none">
      <div
        onClick={() => {
          if (!isInvalid) onSelectDir(nodeNorm);
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex h-8 items-center gap-1.5 pr-2.5 text-xs rounded-xl transition-all duration-120 ${
          isInvalid
            ? "opacity-35 cursor-not-allowed text-muted-foreground"
            : isSelected
            ? "bg-primary text-primary-foreground font-semibold shadow-xs cursor-pointer"
            : "hover:bg-muted/70 text-foreground cursor-pointer"
        }`}
      >
        {subDirectories.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(nodeNorm);
            }}
            className="flex size-4.5 items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded-md transition-colors"
          >
            <ChevronRight
              className={`size-3 transition-transform duration-140 ${
                isExpanded ? "rotate-90" : ""
              } ${isSelected ? "text-primary-foreground" : ""}`}
            />
          </button>
        ) : (
          <span className="size-4.5 shrink-0" />
        )}

        <FileIcon
          name={node.name}
          isDirectory={true}
          isExpanded={isExpanded}
          className="size-3.5 shrink-0"
        />

        <span className="truncate flex-1 font-mono text-[11px] leading-tight">
          {node.name}
        </span>

        {isInvalid && (
          <span className="text-[10px] text-muted-foreground italic shrink-0">
            invalid
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoveItemsModal() {
  const { moveCandidates, closeMove, moveSelectedTo, nodes } = useFileExplorer();
  const { activeWorkspace } = useWorkspace();

  const candidates = moveCandidates;
  const isOpen = candidates !== null && candidates.length > 0;

  const [selectedDir, setSelectedDir] = useState<string>("");
  const [filterQuery, setFilterQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isMoving, setIsMoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize selectedDir to root workspace when opened
  useEffect(() => {
    if (activeWorkspace) {
      const rootNorm = normalizePath(activeWorkspace.rootPath);
      setSelectedDir(rootNorm);
      setExpandedDirs(new Set([rootNorm]));
    }
  }, [activeWorkspace, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMove();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, closeMove]);

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

  const toggleExpand = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  if (!isOpen || !candidates || !activeWorkspace || typeof document === "undefined") {
    return null;
  }

  const handleConfirmMove = async () => {
    if (!selectedDir || invalidPaths.has(selectedDir) || isMoving) return;
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

  const rootNorm = normalizePath(activeWorkspace.rootPath);
  const isRootSelected = selectedDir === rootNorm;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in-0 duration-200 ease-out">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/70 dark:border-white/10 bg-card/98 dark:bg-[#1e1e1e]/98 p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl text-card-foreground animate-in zoom-in-95 duration-200 ease-out flex flex-col max-h-[86vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Move className="size-4" />
            </div>
            <div>
              <h3 id="move-modal-title" className="text-sm font-semibold tracking-tight text-foreground">
                Move {candidates.length === 1 ? `"${candidates[0].name}"` : `${candidates.length} items`}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Select a target destination folder
              </p>
            </div>
          </div>
          <button
            onClick={closeMove}
            className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-pointer transition-all"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Selected candidates preview badge */}
        <div className="py-2.5 shrink-0">
          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto p-2 rounded-xl bg-muted/30 border border-border/60">
            {candidates.slice(0, 6).map((item) => (
              <span
                key={item.path}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-background border border-border/60 text-[11px] font-mono text-foreground shadow-2xs"
              >
                {item.name}
              </span>
            ))}
            {candidates.length > 6 && (
              <span className="text-[11px] text-muted-foreground italic px-1 self-center">
                +{candidates.length - 6} more
              </span>
            )}
          </div>
        </div>

        {/* Search filter input */}
        <div className="relative mb-2 shrink-0">
          <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search destination folders..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-background/80 border border-input/80 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-2 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs flex items-center gap-2 shrink-0 border border-destructive/20">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Folder Tree Browser */}
        <div className="flex-1 min-h-[200px] overflow-y-auto rounded-xl border border-border/60 bg-muted/15 p-2 my-1 divide-y divide-border/20">
          {/* Root Workspace Folder Item */}
          <div
            onClick={() => setSelectedDir(rootNorm)}
            className={`flex h-8 items-center gap-2 px-2.5 text-xs rounded-xl transition-all cursor-pointer ${
              isRootSelected
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "hover:bg-muted/70 text-foreground"
            }`}
          >
            <FolderOpen
              className={`size-4 shrink-0 ${
                isRootSelected ? "text-primary-foreground" : "text-amber-500/90"
              }`}
            />
            <span className="truncate flex-1 font-semibold font-mono text-[11px]">
              {activeWorkspace.name} (Root)
            </span>
          </div>

          {/* Child Folders in Tree */}
          <div className="pt-1.5 space-y-0.5">
            {nodes
              .filter((n) => n.type === "directory")
              .map((dirNode) => (
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
                />
              ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3.5 flex items-center justify-between border-t border-border/60 shrink-0">
          <div className="truncate text-xs text-muted-foreground mr-2 font-mono">
            Destination:{" "}
            <span className="font-semibold text-foreground">
              {selectedDir ? selectedDir.replace(/\\/g, "/") : "None"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeMove}
              disabled={isMoving}
              className="rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmMove}
              disabled={!selectedDir || invalidPaths.has(selectedDir) || isMoving}
              className="rounded-xl cursor-pointer shadow-xs font-medium"
            >
              {isMoving ? "Moving..." : "Move Here"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

