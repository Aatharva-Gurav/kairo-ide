"use client";

import React from "react";
import { useWorkspace } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  RefreshIcon,
  Cancel01Icon,
  FileAddIcon,
  FolderAddIcon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";

interface WorkspaceHeaderProps {
  onNewFileRoot?: () => void;
  onNewFolderRoot?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
}

export function WorkspaceHeader({
  onNewFileRoot,
  onNewFolderRoot,
  onRefresh,
  onCollapseAll,
}: WorkspaceHeaderProps) {
  const { activeWorkspace, closeWorkspace } = useWorkspace();

  if (!activeWorkspace) return null;

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-sidebar-border select-none">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          {onNewFileRoot && (
            <button
              onClick={onNewFileRoot}
              className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
              title="New File..."
            >
              <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
            </button>
          )}
          {onNewFolderRoot && (
            <button
              onClick={onNewFolderRoot}
              className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
              title="New Folder..."
            >
              <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
            </button>
          )}
          {onCollapseAll && (
            <button
              onClick={onCollapseAll}
              className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
              title="Collapse All Folders"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} className="size-3.5" />
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
              title="Refresh Explorer"
            >
              <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
            </button>
          )}
          <button
            onClick={closeWorkspace}
            className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer transition-colors"
            title="Close Workspace"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1.5 mt-0.5">
        <div
          className="flex items-center gap-1.5 font-semibold text-xs text-sidebar-foreground truncate"
          title={activeWorkspace.rootPath}
        >
          <HugeiconsIcon icon={Folder01Icon} className="size-4 shrink-0 text-sidebar-primary" />
          <span className="truncate uppercase tracking-wide">{activeWorkspace.name}</span>
        </div>

        {activeWorkspace.projectTypes && activeWorkspace.projectTypes.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {activeWorkspace.projectTypes.slice(0, 2).map((type) => (
              <span
                key={type}
                className="rounded bg-sidebar-accent px-1.5 py-0.2 text-[9px] font-mono text-sidebar-accent-foreground"
                title={type}
              >
                {type}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
