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
  Search01Icon,
  CollapseIcon,
  ArrowUpDownIcon,
  EyeIcon,
  EyeOffIcon,
} from "@hugeicons/core-free-icons";

interface ExplorerToolbarProps {
  isFilterOpen: boolean;
  onToggleFilter: () => void;
}

const SORT_OPTIONS: Array<{ mode: ExplorerSortMode; label: string }> = [
  { mode: "folders-first", label: "Folders First" },
  { mode: "files-first", label: "Files First" },
  { mode: "alphabetical", label: "Alphabetical" },
  { mode: "type-based", label: "By Extension" },
];

export function ExplorerToolbar({
  isFilterOpen,
  onToggleFilter,
}: ExplorerToolbarProps) {
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

  const { activeWorkspace } = useWorkspace();
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
    <div className="flex items-center justify-between px-2 py-1 border-b border-sidebar-border/60 bg-sidebar/50 text-muted-foreground select-none">
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => startCreateFile(activeWorkspace.rootPath)}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
          title="New File..."
        >
          <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
        </button>
        <button
          onClick={() => startCreateFolder(activeWorkspace.rootPath)}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
          title="New Folder..."
        >
          <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
        </button>
        <button
          onClick={() => refresh()}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
          title="Refresh Explorer"
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
        </button>
        <button
          onClick={collapseAll}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors"
          title="Collapse All Folders"
        >
          <HugeiconsIcon icon={CollapseIcon} className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 relative">
        <button
          onClick={onToggleFilter}
          className={`p-1 rounded cursor-pointer transition-colors ${
            isFilterOpen
              ? "bg-sidebar-accent text-sidebar-primary font-medium"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
          title="Filter Files (Ctrl+F)"
        >
          <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
        </button>

        {/* Sort Menu Button */}
        <button
          onClick={() => setIsSortMenuOpen((prev) => !prev)}
          className={`p-1 rounded cursor-pointer transition-colors ${
            isSortMenuOpen
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
          title={`Sort: ${SORT_OPTIONS.find((s) => s.mode === sortConfig.mode)?.label}`}
        >
          <HugeiconsIcon icon={ArrowUpDownIcon} className="size-3.5" />
        </button>

        {/* Hidden Files Toggle */}
        <button
          onClick={() => setShowHidden(!showHidden)}
          className={`p-1 rounded cursor-pointer transition-colors ${
            showHidden
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
          title={showHidden ? "Hide Hidden Files" : "Show Hidden Files"}
        >
          <HugeiconsIcon
            icon={showHidden ? EyeIcon : EyeOffIcon}
            className="size-3.5"
          />
        </button>

        {/* Sort Dropdown Popover */}
        {isSortMenuOpen && (
          <div
            ref={sortMenuRef}
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-border bg-popover p-1 shadow-md text-popover-foreground text-xs"
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
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs cursor-pointer ${
                  sortConfig.mode === opt.mode
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                }`}
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
    </div>
  );
}

