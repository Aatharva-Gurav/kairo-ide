"use client";

import React from "react";
import { DestinationFolder } from "./types";
import { FileIcon } from "@/features/icon-theme";
import { ChevronRight, Loader2, Folder as FolderIcon, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizePath } from "@/lib/tauri-ipc";

interface DestinationFolderTreeProps {
  workspaceName: string;
  workspaceRootPath: string;
  folders: DestinationFolder[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}

interface FolderRowProps {
  folder: DestinationFolder;
  depth: number;
  selectedPath: string;
  onSelectPath: (path: string) => void;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}

function FolderRow({
  folder,
  depth,
  selectedPath,
  onSelectPath,
  expandedPaths,
  loadingPaths,
  onToggleExpand,
}: FolderRowProps) {
  const normPath = normalizePath(folder.path);
  const isExpanded = expandedPaths.has(normPath);
  const isSelected = normalizePath(selectedPath).toLowerCase() === normPath.toLowerCase();
  const isLoading = loadingPaths.has(normPath);
  const hasChildren = Boolean(folder.children && folder.children.length > 0);

  return (
    <div className="flex flex-col select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectPath(normPath)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectPath(normPath);
          } else if (e.key === "ArrowRight" && !isExpanded) {
            e.preventDefault();
            onToggleExpand(normPath);
          } else if (e.key === "ArrowLeft" && isExpanded) {
            e.preventDefault();
            onToggleExpand(normPath);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={cn(
          "group flex h-7.5 items-center gap-1.5 pr-2.5 rounded-lg text-xs cursor-pointer transition-all duration-120 border border-transparent",
          isSelected
            ? "bg-primary/12 text-primary font-medium border-primary/25 shadow-2xs"
            : "hover:bg-muted/70 text-foreground/90 hover:text-foreground"
        )}
      >
        {/* Expand / Collapse Disclosure Chevron */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(normPath);
          }}
          className="flex size-4.5 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
        >
          {isLoading ? (
            <Loader2 className="size-3 animate-spin text-primary" />
          ) : (
            <ChevronRight
              className={cn(
                "size-3 transition-transform duration-140",
                isExpanded ? "rotate-90 text-foreground" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
          )}
        </button>

        {/* Folder Icon from theme */}
        <div className="size-4 shrink-0 flex items-center justify-center">
          <FileIcon
            name={folder.name}
            isDirectory={true}
            isExpanded={isExpanded}
            className="size-3.5"
          />
        </div>

        {/* Folder Name */}
        <span className="truncate flex-1 font-mono text-[11.5px] tracking-tight">
          {folder.name}
        </span>

        {/* Selected Pill Indicator */}
        {isSelected && (
          <span className="size-1.5 rounded-full bg-primary shrink-0 animate-in fade-in-50 duration-150" />
        )}
      </div>

      {/* Render Subfolders if expanded */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col space-y-0.5 mt-0.5">
          {folder.children!.map((child) => (
            <FolderRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              expandedPaths={expandedPaths}
              loadingPaths={loadingPaths}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}

      {/* Expanded but no subfolders state */}
      {isExpanded && !hasChildren && !isLoading && folder.isLoaded && (
        <div
          style={{ paddingLeft: `${(depth + 1) * 14 + 18}px` }}
          className="py-1 text-[10px] text-muted-foreground/60 italic font-mono select-none"
        >
          No subfolders
        </div>
      )}
    </div>
  );
}

export function DestinationFolderTree({
  workspaceName,
  workspaceRootPath,
  folders,
  selectedPath,
  onSelectPath,
  expandedPaths,
  loadingPaths,
  onToggleExpand,
}: DestinationFolderTreeProps) {
  const normRoot = normalizePath(workspaceRootPath);
  const isRootSelected = normalizePath(selectedPath).toLowerCase() === normRoot.toLowerCase();

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Workspace Root Destination Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectPath(normRoot)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectPath(normRoot);
          }
        }}
        className={cn(
          "group flex h-8 items-center gap-2 px-2 rounded-lg text-xs cursor-pointer transition-all duration-120 border",
          isRootSelected
            ? "bg-primary/12 text-primary font-semibold border-primary/30 shadow-2xs"
            : "hover:bg-muted/70 text-foreground border-border/40 hover:border-border/70"
        )}
      >
        <div className="flex size-5 items-center justify-center rounded-md bg-sidebar-accent/50 text-foreground shrink-0">
          <HardDrive className={cn("size-3.5", isRootSelected ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="truncate font-sans font-medium text-[11.5px] leading-tight">
            {workspaceName}
          </span>
          <span className="text-[10px] text-muted-foreground leading-none font-mono">
            Workspace Root (/)
          </span>
        </div>

        {isRootSelected && (
          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-sans font-medium bg-primary/20 text-primary shrink-0">
            Selected
          </span>
        )}
      </div>

      {/* Subfolder Tree */}
      <div className="flex flex-col space-y-0.5 mt-1">
        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            depth={0}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
            expandedPaths={expandedPaths}
            loadingPaths={loadingPaths}
            onToggleExpand={onToggleExpand}
          />
        ))}

        {folders.length === 0 && (
          <div className="py-3 text-center text-xs text-muted-foreground font-sans">
            No folders found in workspace.
          </div>
        )}
      </div>
    </div>
  );
}

