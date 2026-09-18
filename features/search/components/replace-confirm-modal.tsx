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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in-0">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl text-card-foreground">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-500/10 p-2 text-amber-500 shrink-0">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Confirm Workspace Replace</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Replace <strong className="text-foreground">{totalMatches}</strong> occurrence
              {totalMatches !== 1 ? "s" : ""} across{" "}
              <strong className="text-foreground">{results.length}</strong> file
              {results.length !== 1 ? "s" : ""} with &quot;
              <span className="font-mono text-foreground font-medium">{replaceQuery}</span>&quot;?
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
              This will directly modify the files on disk.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={cancelReplaceAll}>
            Cancel
          </Button>
          <Button size="sm" onClick={confirmReplaceAll}>
            Replace All
          </Button>
        </div>
      </div>
    </div>
  );
}

