import React from "react";
import { useFileExplorer } from "../store";
import {
  Copy,
  Scissors,
  Trash2,
  X,
  Pencil,
  ArrowRight,
} from "lucide-react";

export function ExplorerBulkBar() {
  const {
    selectedPaths,
    copySelected,
    cutSelected,
    duplicateSelected,
    startMove,
    startBatchRename,
    promptDelete,
    clearSelection,
  } = useFileExplorer();

  if (selectedPaths.size <= 1) return null;

  return (
    <div className="flex items-center justify-between px-2.5 py-1 bg-primary/10 border-b border-primary/20 text-xs select-none animate-in fade-in-0 slide-in-from-top-2 duration-150 ease-out shrink-0">
      <span className="font-semibold text-[11px] text-primary font-mono animate-kairo-pop">
        {selectedPaths.size} selected
      </span>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => copySelected()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          title="Copy Selected (Ctrl+C)"
        >
          <Copy className="size-3" />
          <span>Copy</span>
        </button>
        <button
          onClick={() => cutSelected()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          title="Cut Selected (Ctrl+X)"
        >
          <Scissors className="size-3" />
          <span>Cut</span>
        </button>
        <button
          onClick={() => duplicateSelected()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          title="Duplicate Selected (Ctrl+D)"
        >
          <Copy className="size-3" />
          <span>Duplicate</span>
        </button>
        <button
          onClick={() => startMove()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          title="Move Selected To..."
        >
          <ArrowRight className="size-3" />
          <span>Move...</span>
        </button>
        <button
          onClick={() => startBatchRename()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          title="Batch Rename Selected (F2)"
        >
          <Pencil className="size-3" />
          <span>Rename...</span>
        </button>
        <button
          onClick={() => promptDelete()}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-destructive hover:bg-destructive/15 cursor-pointer transition-colors duration-120 active:scale-95 font-medium"
          title="Delete Selected (Del)"
        >
          <Trash2 className="size-3" />
          <span>Delete</span>
        </button>
        <button
          onClick={clearSelection}
          className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer transition-colors duration-120 active:scale-90 ml-0.5"
          title="Clear Selection (Esc)"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
