"use client";

import React, { useState } from "react";
import { useFileExplorer, findNodesByPaths } from "../store";
import { useWorkspace } from "../../workspace/store";
import { FileTreeNode, InlineCreationInput } from "./file-tree-node";
import { FileSystemNode } from "../types";
import { normalizePath, dirname, isDescendant } from "@/lib/tauri-ipc";
import { FileExplorerService } from "../service";
import { AlertCircle, X } from "lucide-react";

interface ExplorerTreeProps {
  onOpenContextMenu: (e: React.MouseEvent, node: FileSystemNode | null) => void;
}

export function ExplorerTree({ onOpenContextMenu }: ExplorerTreeProps) {
  const { activeWorkspace } = useWorkspace();
  const {
    nodes,
    displayNodes,
    isLoading,
    error,
    clearError,
    inlineAction,
    selectNode,
    handleKeyDown,
    handleDrop,
    moveSelectedTo,
    filterQuery,
    refresh,
  } = useFileExplorer();

  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!activeWorkspace) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsRootDragOver(true);
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRootDragOver(false);
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRootDragOver(false);

    if (!activeWorkspace) return;

    // Check for OS files / folders drag-and-drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !e.dataTransfer.getData("text/plain")) {
      const imported = await FileExplorerService.importExternalFiles(e.dataTransfer, activeWorkspace.rootPath);
      if (imported.length > 0) {
        await refresh(activeWorkspace.rootPath);
      }
      return;
    }

    // Check if bulk JSON payload exists
    const jsonPayload = e.dataTransfer.getData("application/json");
    if (jsonPayload) {
      try {
        const paths: string[] = JSON.parse(jsonPayload);
        const nodesToMove = findNodesByPaths(nodes, new Set(paths));
        if (nodesToMove.length > 0) {
          await moveSelectedTo(activeWorkspace.rootPath, nodesToMove);
          return;
        }
      } catch {
        // Fallback to single text
      }
    }

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === activeWorkspace.rootPath) return;

    // Already directly under root
    if (dirname(sourcePath) === activeWorkspace.rootPath) {
      return;
    }

    // Cannot drop parent into its own child
    if (isDescendant(sourcePath, activeWorkspace.rootPath)) {
      return;
    }

    const singleNode = findNodesByPaths(nodes, new Set([sourcePath]));
    if (singleNode.length > 0) {
      await moveSelectedTo(activeWorkspace.rootPath, singleNode);
    } else {
      await handleDrop(sourcePath, activeWorkspace.rootPath);
    }
  };

  const isCreatingRootChild =
    activeWorkspace &&
    inlineAction &&
    (inlineAction.type === "create-file" || inlineAction.type === "create-folder") &&
    normalizePath(inlineAction.parentPath) === normalizePath(activeWorkspace.rootPath);

  if (!activeWorkspace) return null;

  return (
    <div
      role="tree"
      aria-label="Files Explorer"
      aria-multiselectable="true"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => selectNode(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenContextMenu(e, null);
      }}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
      data-file-explorer="true"
      data-folder-path={activeWorkspace.rootPath}
      className={`relative flex flex-col flex-1 min-h-0 w-full outline-none select-none overflow-y-auto no-scrollbar pt-1.5 pb-16 px-1 transition-colors focus-visible:ring-1 focus-visible:ring-sidebar-ring/40 ${
        isRootDragOver ? "bg-sidebar-primary/5 ring-1 ring-inset ring-sidebar-primary/30" : ""
      }`}
    >
      {/* Visual drop indicator */}
      {isRootDragOver && (
        <div className="pointer-events-none sticky top-2 z-20 mx-2 mb-2 flex items-center justify-center rounded border border-dashed border-sidebar-primary/50 bg-sidebar-primary/10 py-2 text-[11px] font-medium text-sidebar-primary shadow-sm backdrop-blur-xs">
          Drop files or folders to add to root
        </div>
      )}
      {/* Error alert banner */}
      {error && (
        <div className="mx-2 mb-2 flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-tight">{error}</div>
          <button
            onClick={clearError}
            className="text-destructive/70 hover:text-destructive shrink-0 cursor-pointer"
            title="Dismiss error"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Inline root child creation */}
      {isCreatingRootChild && (
        <InlineCreationInput
          depth={0}
          type={inlineAction.type as "create-file" | "create-folder"}
        />
      )}

      {/* Loading Skeleton */}
      {isLoading && displayNodes.length === 0 ? (
        <div className="flex flex-col gap-2 p-3">
          <div className="h-4 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-4/5 rounded bg-muted/40 animate-pulse" />
        </div>
      ) : displayNodes.length === 0 && !isCreatingRootChild ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
          {filterQuery ? (
            <>
              <span>No files matching &ldquo;{filterQuery}&rdquo;</span>
              <span className="text-[10px] mt-1 text-muted-foreground/70">
                Press Esc to clear the search filter
              </span>
            </>
          ) : (
            <>
              <span>Folder is empty</span>
              <span className="text-[10px] mt-1 text-muted-foreground/70">
                Right-click to create a file or folder
              </span>
            </>
          )}
        </div>
      ) : (
        displayNodes.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            onOpenContextMenu={onOpenContextMenu}
          />
        ))
      )}
    </div>
  );
}

