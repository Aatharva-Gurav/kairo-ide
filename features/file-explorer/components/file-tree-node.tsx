"use client";

import React, { useState, useRef, useEffect } from "react";
import { FileSystemNode } from "../types";
import { useFileExplorer } from "../store";
import { FileIcon } from "./file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { normalizePath, isDescendant } from "@/lib/tauri-ipc";
import { cn } from "@/lib/utils";

interface FileTreeNodeProps {
  node: FileSystemNode;
  depth?: number;
  onOpenContextMenu: (e: React.MouseEvent, node: FileSystemNode) => void;
}

export function FileTreeNode({
  node,
  depth = 0,
  onOpenContextMenu,
}: FileTreeNodeProps) {
  const {
    selectedPaths,
    expandedPaths,
    clipboard,
    inlineAction,
    toggleExpand,
    selectNode,
    openFile,
    commitInlineAction,
    cancelInlineAction,
    handleDrop,
  } = useFileExplorer();

  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDirectory = node.type === "directory";
  const nodeNorm = normalizePath(node.path);
  const isExpanded =
    node.isExpanded || (isDirectory && expandedPaths.has(nodeNorm));
  const isSelected = selectedPaths.has(nodeNorm);
  const isCut =
    clipboard?.type === "cut" &&
    clipboard.sourceNodes.some((n) => normalizePath(n.path) === nodeNorm);

  const isRenaming =
    inlineAction?.type === "rename" &&
    inlineAction.targetNodeId &&
    normalizePath(inlineAction.targetNodeId) === nodeNorm;

  const isCreatingChild =
    inlineAction &&
    (inlineAction.type === "create-file" || inlineAction.type === "create-folder") &&
    normalizePath(inlineAction.parentPath) === nodeNorm;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      const name = node.name;
      const lastDot = name.lastIndexOf(".");
      if (lastDot > 0 && !isDirectory) {
        inputRef.current.setSelectionRange(0, lastDot);
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming, node.name, isDirectory]);

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (selectedPaths.size > 1 && selectedPaths.has(nodeNorm)) {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify(Array.from(selectedPaths))
      );
    }
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleNodeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!isDirectory) return;

    const jsonPayload = e.dataTransfer.getData("application/json");
    if (jsonPayload) {
      try {
        const paths: string[] = JSON.parse(jsonPayload);
        for (const p of paths) {
          if (!isDescendant(p, node.path) && p !== node.path) {
            await handleDrop(p, node.path);
          }
        }
        return;
      } catch {
        // Fallback to plain text
      }
    }

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === node.path) return;

    if (isDescendant(sourcePath, node.path)) {
      return;
    }

    await handleDrop(sourcePath, node.path);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInlineAction(e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineAction();
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitInlineAction(e.currentTarget.value);
  };

  return (
    <div className="flex flex-col select-none">
      <div
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleNodeDrop}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            selectNode(node, true, e.shiftKey);
          } else {
            openFile(node);
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openFile(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!selectedPaths.has(nodeNorm)) {
            selectNode(node, false, false);
          }
          onOpenContextMenu(e, node);
        }}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={cn(
          "group relative flex h-6.5 w-full items-center gap-1.5 pr-2 text-xs transition-colors duration-100 ease-out cursor-pointer rounded-xs select-none",
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-2xs before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-sidebar-primary before:rounded-r-full"
            : "text-sidebar-foreground/90 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          isCut && "opacity-45",
          isDragOver && "bg-sidebar-primary/20 ring-1 ring-sidebar-primary/80 ring-inset"
        )}
      >
        {/* Expand / Collapse toggle or indent spacing */}
        {isDirectory ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node);
            }}
            className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70 hover:text-foreground cursor-pointer rounded transition-all duration-140"
            tabIndex={-1}
          >
            {node.isLoading ? (
              <span className="size-1.5 rounded-full bg-sidebar-primary animate-pulse" />
            ) : (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className={cn(
                  "size-2.5 transition-transform duration-160 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isExpanded && "rotate-90"
                )}
              />
            )}
          </button>
        ) : (
          <span className="size-3.5 shrink-0" />
        )}

        {/* File or Folder Icon */}
        <FileIcon
          name={node.name}
          isDirectory={isDirectory}
          isExpanded={isExpanded}
          className="size-3.5 shrink-0 transition-transform duration-140 group-hover:scale-105"
        />

        {/* Name or Rename Input */}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            defaultValue={node.name}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onClick={(e) => e.stopPropagation()}
            className="h-5.5 flex-1 rounded bg-background border border-sidebar-ring px-1.5 py-0 text-xs text-foreground font-sans outline-none shadow-2xs focus:ring-1 focus:ring-sidebar-ring"
          />
        ) : (
          <span className="truncate leading-none text-left tracking-tight" title={node.name}>
            {node.name}
          </span>
        )}
      </div>

      {/* Children list when expanded */}
      {isDirectory && isExpanded && (
        <div className="flex flex-col animate-in fade-in-0 slide-in-from-top-1 duration-150 delay-subtle ease-out origin-top">
          {/* Inline creation inside this folder */}
          {isCreatingChild && (
            <InlineCreationInput
              depth={depth + 1}
              type={inlineAction.type as "create-file" | "create-folder"}
            />
          )}

          {node.children && node.children.length > 0 ? (
            node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpenContextMenu={onOpenContextMenu}
              />
            ))
          ) : !node.isLoading && !isCreatingChild ? (
            <div
              style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
              className="py-1 text-[11px] text-muted-foreground/60 italic animate-in fade-in-50 duration-100"
            >
              (empty)
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Inline input row when creating a new file or folder
 */
export function InlineCreationInput({
  depth,
  type,
}: {
  depth: number;
  type: "create-file" | "create-folder";
}) {
  const { commitInlineAction, cancelInlineAction } = useFileExplorer();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInlineAction(e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineAction();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitInlineAction(e.currentTarget.value);
  };

  const isDirectory = type === "create-folder";

  return (
    <div
      style={{ paddingLeft: `${depth * 14 + 6}px` }}
      className="flex h-6.5 w-full items-center gap-1.5 pr-2 text-xs"
    >
      <span className="size-3.5 shrink-0" />
      <FileIcon
        name={isDirectory ? "folder" : "file"}
        isDirectory={isDirectory}
        className="size-3.5 shrink-0"
      />
      <input
        ref={inputRef}
        type="text"
        placeholder={isDirectory ? "folder name..." : "file name..."}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="h-5.5 flex-1 rounded bg-background border border-sidebar-ring px-1.5 py-0 text-xs text-foreground font-sans outline-none shadow-2xs focus:ring-1 focus:ring-sidebar-ring placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
