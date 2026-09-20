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
    isLoading,
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

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  if (!activeWorkspace) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full border border-sidebar-border/90 bg-sidebar/95 backdrop-blur-md shadow-md text-muted-foreground select-none max-w-[calc(100%-1.5rem)] transition-all duration-150 hover:shadow-lg hover:border-sidebar-primary/50 animate-in fade-in-0 slide-from-bottom-2">
      {/* File & Folder Actions */}
      <button
        onClick={() => startCreateFile(activeWorkspace.rootPath)}
        className="p-1 rounded-full hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer transition-colors duration-140 active:scale-95"
        title="New File..."
      >
        <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
      </button>
      <button
        onClick={() => startCreateFolder(activeWorkspace.rootPath)}
        className="p-1 rounded-full hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer transition-colors duration-140 active:scale-95"
        title="New Folder..."
      >
        <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
      </button>
      <button
        onClick={handleRefresh}
        className="p-1 rounded-full hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer transition-colors duration-140 active:scale-95"
        title="Refresh Explorer"
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          className={cn(
            "size-3.5 transition-transform duration-300",
            (isLoading || isRefreshing) && "animate-kairo-spin text-sidebar-primary"
          )}
        />
      </button>
      <button
        onClick={collapseAll}
        className="p-1 rounded-full hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer transition-colors duration-140 active:scale-95"
        title="Collapse All Folders"
      >
        <HugeiconsIcon icon={CollapseIcon} className="size-3.5" />
      </button>

      {/* Divider */}
      <div className="h-3 w-px bg-sidebar-border/80 my-auto mx-0.5 shrink-0" />

      {/* Sort Menu Button with Upward Popover */}
      <div className="relative flex items-center">
        <button
          onClick={() => setIsSortMenuOpen((prev) => !prev)}
          className={cn(
            "p-1 rounded-full cursor-pointer transition-colors duration-140 active:scale-95",
            isSortMenuOpen
              ? "bg-sidebar-accent text-sidebar-primary"
              : "hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
          title={`Sort: ${SORT_OPTIONS.find((s) => s.mode === sortConfig.mode)?.label}`}
        >
          <HugeiconsIcon icon={ArrowUpDownIcon} className="size-3.5" />
        </button>

        {isSortMenuOpen && (
          <div
            ref={sortMenuRef}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-40 rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-popover-foreground text-xs animate-in fade-in-0 zoom-in-95 duration-120 delay-subtle origin-bottom"
          >
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
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
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs cursor-pointer transition-colors active:scale-98",
                  sortConfig.mode === opt.mode
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "hover:bg-accent/60 text-popover-foreground"
                )}
              >
                <span>{opt.label}</span>
                {sortConfig.mode === opt.mode && (
                  <span className="text-primary text-[11px] font-bold">✓</span>
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
          "p-1 rounded-full cursor-pointer transition-colors duration-140 active:scale-95",
          showHidden
            ? "bg-sidebar-accent text-sidebar-primary"
            : "hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
        title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
      >
        <HugeiconsIcon
          icon={showHidden ? EyeIcon : EyeOffIcon}
          className="size-3.5"
        />
      </button>

      {/* Divider */}
      <div className="h-3 w-px bg-sidebar-border/80 my-auto mx-0.5 shrink-0" />

      {/* Close Workspace Button */}
      <button
        onClick={closeWorkspace}
        className="p-1 rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive cursor-pointer transition-colors duration-140 active:scale-95"
        title="Close Workspace"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </div>
  );
}