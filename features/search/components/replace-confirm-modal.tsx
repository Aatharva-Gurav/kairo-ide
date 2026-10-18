"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearch } from "../store";
import { Button } from "@/components/ui/button";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { AlertTriangle, ArrowRight, Replace, X } from "lucide-react";

export function ReplaceConfirmModal() {
  const {
    isReplaceConfirmOpen,
    confirmReplaceAll,
    cancelReplaceAll,
    totalMatches,
    results,
    query,
    replaceQuery,
    isReplacing,
  } = useSearch();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReplaceConfirmOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelReplaceAll();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!isReplacing && totalMatches > 0) {
          confirmReplaceAll();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReplaceConfirmOpen, cancelReplaceAll, confirmReplaceAll, isReplacing, totalMatches]);

  if (!isReplaceConfirmOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-popover/98 dark:bg-[#1a1a1a]/98 p-4 shadow-2xl backdrop-blur-md text-popover-foreground animate-in zoom-in-95 duration-150 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-dialog-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Replace className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 id="replace-dialog-title" className="text-sm font-semibold tracking-tight text-foreground truncate">
                Confirm Workspace Replace
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Replace all occurrences across workspace files
              </p>
            </div>
          </div>
          <button
            onClick={cancelReplaceAll}
            title="Close (Esc)"
            className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Diff & Affected Files Preview */}
        <div className="my-3 space-y-2.5">
          {/* Find -> Replace Diff Box */}
          <div className="p-2.5 rounded-lg bg-background/60 border border-border/60 text-xs flex items-center justify-between gap-2 font-mono">
            <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-destructive/10 text-destructive border border-destructive/20 rounded px-2 py-1">
              <span className="text-[10px] text-muted-foreground select-none">Find:</span>
              <span className="truncate font-semibold">{query}</span>
            </div>

            <ArrowRight className="size-3.5 text-muted-foreground/60 shrink-0" />

            <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded px-2 py-1">
              <span className="text-[10px] text-muted-foreground select-none">Replace:</span>
              <span className="truncate font-semibold">
                {replaceQuery ? replaceQuery : <span className="italic text-muted-foreground font-normal">(empty)</span>}
              </span>
            </div>
          </div>

          {/* Occurrences & Affected Files summary */}
          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground font-medium">Affected Files</span>
              <span className="font-mono text-foreground font-semibold">
                {totalMatches} match{totalMatches !== 1 ? "es" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="max-h-28 overflow-y-auto space-y-1 pt-1 divide-y divide-border/20">
              {results.slice(0, 5).map((file) => (
                <div key={file.filePath} className="flex items-center justify-between text-[11px] gap-2 py-1 px-1">
                  <span className="flex items-center gap-1.5 truncate min-w-0">
                    <FileIcon name={file.fileName} className="size-3 shrink-0" />
                    <span className="font-mono text-foreground truncate">{file.fileName}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 bg-muted px-1.5 py-0.5 rounded">
                    {file.matches.length}
                  </span>
                </div>
              ))}
              {results.length > 5 && (
                <div className="text-[10px] text-muted-foreground/80 italic pl-1 pt-1">
                  +{results.length - 5} more files
                </div>
              )}
            </div>
          </div>

          {/* Caution warning */}
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span className="text-[11px]">
              This action will directly modify files on disk. Changes in open tabs will update automatically.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2.5 flex items-center justify-between border-t border-border/50 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono">↵</kbd>
            <span>Replace All</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono ml-1.5">esc</kbd>
            <span>Cancel</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelReplaceAll}
              disabled={isReplacing}
              className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmReplaceAll}
              disabled={isReplacing || totalMatches === 0}
              className="h-7 px-3 text-xs rounded-md font-medium bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-2xs"
            >
              {isReplacing ? "Replacing..." : "Replace All"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
