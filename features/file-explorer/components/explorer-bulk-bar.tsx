"use client";

import React from "react";
import { useFileExplorer } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  ScissorsIcon,
  Delete02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

export function ExplorerBulkBar() {
  const {
    selectedPaths,
    copySelected,
    cutSelected,
    promptDelete,
    clearSelection,
  } = useFileExplorer();

  if (selectedPaths.size <= 1) return null;

  return (
    <div className="flex items-center justify-between px-2.5 py-1 bg-sidebar-primary/10 border-b border-sidebar-primary/20 text-xs select-none animate-in fade-in-0 duration-150">
      <span className="font-semibold text-[11px] text-sidebar-primary">
        {selectedPaths.size} items selected
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => copySelected()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground cursor-pointer transition-colors"
          title="Copy Selected (Ctrl+C)"
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-3" />
          <span>Copy</span>
        </button>
        <button
          onClick={() => cutSelected()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground cursor-pointer transition-colors"
          title="Cut Selected (Ctrl+X)"
        >
          <HugeiconsIcon icon={ScissorsIcon} className="size-3" />
          <span>Cut</span>
        </button>
        <button
          onClick={() => promptDelete()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
          title="Delete Selected (Del)"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3" />
          <span>Delete</span>
        </button>
        <button
          onClick={clearSelection}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer transition-colors ml-1"
          title="Clear Selection (Esc)"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
        </button>
      </div>
    </div>
  );
}

