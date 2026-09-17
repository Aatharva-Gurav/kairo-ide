"use client";

import React, { useState } from "react";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { FileTreeNode, InlineCreationInput } from "./file-tree-node";
import { FileSystemNode } from "../types";
import { normalizePath, isDescendant } from "@/lib/tauri-ipc";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

interface ExplorerTreeProps {
  onOpenContextMenu: (e: React.MouseEvent, node: FileSystemNode | null) => void;
}

export function ExplorerTree({ onOpenContextMenu }: ExplorerTreeProps) {
  const { activeWorkspace } = useWorkspace();
  const {
    displayNodes,
    isLoading,
    error,
    clearError,
    inlineAction,
    selectNode,
    handleKeyDown,
    handleDrop,
    filterQuery,
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

    // Check if bulk JSON payload exists
    const jsonPayload = e.dataTransfer.getData("application/json");
    if (jsonPayload) {
      try {
        const paths: string[] = JSON.parse(jsonPayload);
        for (const p of paths) {
          if (!isDescendant(p, activeWorkspace.rootPath) && p !== activeWorkspace.rootPath) {
            await handleDrop(p, activeWorkspace.rootPath);
          }
        }
        return;
      } catch {
        // Fallback to single text
      }
    }

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === activeWorkspace.rootPath) return;

    if (isDescendant(sourcePath, activeWorkspace.rootPath)) {
      return;
    }

    await handleDrop(sourcePath, activeWorkspace.rootPath);
  };

  const isCreatingRootChild =
    activeWorkspace &&
    inlineAction &&
    (inlineAction.type === "create-file" || inlineAction.type === "create-folder") &&
    normalizePath(inlineAction.parentPath) === normalizePath(activeWorkspace.rootPath);

  if (!activeWorkspace) return null;

  return (
    <div
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
      className={`flex flex-col flex-1 min-h-0 w-full outline-none select-none overflow-y-auto no-scrollbar pt-1.5 pb-16 px-1 ${
        isRootDragOver ? "bg-sidebar-primary/5" : ""
      }`}
    >
      {/* Error alert banner */}
      {error && (
        <div className="mx-2 mb-2 flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-tight">{error}</div>
          <button
            onClick={clearError}
            className="text-destructive/70 hover:text-destructive shrink-0 cursor-pointer"
            title="Dismiss error"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
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

