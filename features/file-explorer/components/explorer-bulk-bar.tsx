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
    <div className="mx-2 my-1.5 px-3 py-1.5 rounded-2xl bg-card/95 dark:bg-[#202020]/95 backdrop-blur-xl border border-border/80 dark:border-white/10 shadow-lg flex items-center justify-between gap-2 text-xs select-none animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-mono text-[11px] font-semibold">
          {selectedPaths.size} selected
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => copySelected()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-120 cursor-pointer active:scale-95"
          title="Copy Selected (Ctrl+C)"
        >
          <Copy className="size-3" />
          <span>Copy</span>
        </button>
        <button
          onClick={() => cutSelected()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-120 cursor-pointer active:scale-95"
          title="Cut Selected (Ctrl+X)"
        >
          <Scissors className="size-3" />
          <span>Cut</span>
        </button>
        <button
          onClick={() => duplicateSelected()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-120 cursor-pointer active:scale-95"
          title="Duplicate Selected (Ctrl+D)"
        >
          <Copy className="size-3" />
          <span>Duplicate</span>
        </button>
        <button
          onClick={() => startMove()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-120 cursor-pointer active:scale-95"
          title="Move Selected To..."
        >
          <ArrowRight className="size-3" />
          <span>Move...</span>
        </button>
        <button
          onClick={() => startBatchRename()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-120 cursor-pointer active:scale-95"
          title="Batch Rename Selected (F2)"
        >
          <Pencil className="size-3" />
          <span>Rename...</span>
        </button>
        <button
          onClick={() => promptDelete()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium text-destructive hover:bg-destructive/15 transition-all duration-120 cursor-pointer active:scale-95"
          title="Delete Selected (Del)"
        >
          <Trash2 className="size-3" />
          <span>Delete</span>
        </button>
        <button
          onClick={clearSelection}
          className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-120 cursor-pointer active:scale-90 ml-1"
          title="Clear Selection (Esc)"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
