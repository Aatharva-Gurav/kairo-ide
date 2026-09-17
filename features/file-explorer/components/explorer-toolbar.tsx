"use client";

import React, { useState, useRef, useEffect } from "react";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { ExplorerSortMode } from "../types";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileAddIcon,
  FolderAddIcon,
  RefreshIcon,
  CollapseIcon,
  ArrowUpDownIcon,
  EyeIcon,
  EyeOffIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: Array<{ mode: ExplorerSortMode; label: string }> = [
  { mode: "folders-first", label: "Folders First" },
  { mode: "files-first", label: "Files First" },
  { mode: "alphabetical", label: "Alphabetical" },
  { mode: "type-based", label: "By Extension" },
];

export function ExplorerToolbar() {
  const {
    startCreateFile,
    startCreateFolder,
    collapseAll,
    refresh,
    showHidden,
    setShowHidden,
    sortConfig,
    setSortMode,
  } = useFileExplorer();

  const { activeWorkspace, closeWorkspace } = useWorkspace();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(e.target as Node)
      ) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSortMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isSortMenuOpen]);

  if (!activeWorkspace) return null;

  return (
    <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full border border-sidebar-border/80 bg-sidebar/75 dark:bg-sidebar/85 backdrop-blur-md shadow-lg shadow-black/10 text-muted-foreground select-none max-w-[calc(100%-1.5rem)]">
      {/* File & Folder Actions */}
      <button
        onClick={() => startCreateFile(activeWorkspace.rootPath)}
        className="p-1.5 rounded-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
        title="New File..."
      >
        <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
      </button>
      <button
        onClick={() => startCreateFolder(activeWorkspace.rootPath)}
        className="p-1.5 rounded-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
        title="New Folder..."
      >
        <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
      </button>
      <button
        onClick={() => refresh()}
        className="p-1.5 rounded-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
        title="Refresh Explorer"
      >
        <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
      </button>
      <button
        onClick={collapseAll}
        className="p-1.5 rounded-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
        title="Collapse All Folders"
      >
        <HugeiconsIcon icon={CollapseIcon} className="size-3.5" />
      </button>

      {/* Divider */}
      <div className="h-3.5 w-px bg-sidebar-border/80 my-auto mx-0.5 shrink-0" />

      {/* Sort Menu Button with Upward Popover */}
      <div className="relative flex items-center">
        <button
          onClick={() => setIsSortMenuOpen((prev) => !prev)}
          className={cn(
            "p-1.5 rounded-full cursor-pointer transition-colors",
            isSortMenuOpen
              ? "bg-sidebar-accent text-sidebar-primary"
              : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          title={`Sort: ${SORT_OPTIONS.find((s) => s.mode === sortConfig.mode)?.label}`}
        >
          <HugeiconsIcon icon={ArrowUpDownIcon} className="size-3.5" />
        </button>

        {isSortMenuOpen && (
          <div
            ref={sortMenuRef}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-36 rounded-xl border border-sidebar-border/80 bg-popover/95 backdrop-blur-md p-1 shadow-xl text-popover-foreground text-xs"
          >
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Sort By
            </div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => {
                  setSortMode(opt.mode);
                  setIsSortMenuOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs cursor-pointer",
                  sortConfig.mode === opt.mode
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                )}
              >
                <span>{opt.label}</span>
                {sortConfig.mode === opt.mode && (
                  <span className="text-sidebar-primary text-[11px]">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hidden Files Toggle */}
      <button
        onClick={() => setShowHidden(!showHidden)}
        className={cn(
          "p-1.5 rounded-full cursor-pointer transition-colors",
          showHidden
            ? "bg-sidebar-accent text-sidebar-primary"
            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
        title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
      >
        <HugeiconsIcon
          icon={showHidden ? EyeIcon : EyeOffIcon}
          className="size-3.5"
        />
      </button>

      {/* Divider */}
      <div className="h-3.5 w-px bg-sidebar-border/80 my-auto mx-0.5 shrink-0" />

      {/* Close Workspace Button */}
      <button
        onClick={closeWorkspace}
        className="p-1.5 rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive cursor-pointer transition-colors"
        title="Close Workspace"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </div>
  );
}