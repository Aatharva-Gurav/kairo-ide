"use client";

import React, { useEffect } from "react";
import { useSearch } from "../store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

export function ReplaceConfirmModal() {
  const {
    isReplaceConfirmOpen,
    confirmReplaceAll,
    cancelReplaceAll,
    totalMatches,
    results,
    replaceQuery,
  } = useSearch();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReplaceConfirmOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelReplaceAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReplaceConfirmOpen, cancelReplaceAll]);

  if (!isReplaceConfirmOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150 ease-out">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-start gap-3.5">
          <div className="rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 p-2 text-amber-600 dark:text-amber-400 shrink-0">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Confirm Workspace Replace</h3>
            <div className="mt-2 rounded-md bg-muted/40 border border-border/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
              Replace <strong className="text-foreground font-semibold">{totalMatches}</strong> occurrence
              {totalMatches !== 1 ? "s" : ""} across{" "}
              <strong className="text-foreground font-semibold">{results.length}</strong> file
              {results.length !== 1 ? "s" : ""} with &quot;
              <span className="font-mono text-foreground font-medium bg-muted/60 px-1 py-0.5 rounded text-[11px]">{replaceQuery}</span>&quot;?
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-2.5 italic">
              This action will directly modify files on disk.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          <Button variant="outline" size="sm" onClick={cancelReplaceAll} className="cursor-pointer active:scale-95 transition-all duration-120">
            Cancel
          </Button>
          <Button size="sm" onClick={confirmReplaceAll} className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white cursor-pointer active:scale-95 transition-all duration-120">
            Replace All
          </Button>
        </div>
      </div>
    </div>
  );
}
