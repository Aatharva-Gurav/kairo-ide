"use client";

import React, { useEffect } from "react";
import { useFileExplorer } from "../store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

export function ConfirmDeleteModal() {
  const { bulkDeleteCandidate, deleteCandidate, cancelDelete, confirmDelete } =
    useFileExplorer();

  const candidates = bulkDeleteCandidate || (deleteCandidate ? [deleteCandidate] : []);
  const isOpen = candidates.length > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelDelete();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, cancelDelete]);

  if (!isOpen) return null;

  const isMultiple = candidates.length > 1;
  const hasDirectory = candidates.some((n) => n.type === "directory");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4.5" />
          </div>
          <div className="flex-1">
            <h3 id="delete-dialog-title" className="text-sm font-semibold tracking-tight text-foreground">
              {isMultiple
                ? `Delete ${candidates.length} items?`
                : `Delete ${hasDirectory ? "directory" : "file"}?`}
            </h3>

            {isMultiple ? (
              <div className="mt-1.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Are you sure you want to delete these {candidates.length} items?
                </p>
                <div className="mt-2 max-h-28 overflow-y-auto rounded-md bg-muted/30 border border-border/60 p-2 text-[11px] font-mono space-y-0.5">
                  {candidates.slice(0, 5).map((item) => (
                    <div key={item.path} className="truncate text-foreground/90">
                      • {item.name}
                    </div>
                  ))}
                  {candidates.length > 5 && (
                    <div className="text-muted-foreground italic pl-2">
                      + {candidates.length - 5} more items
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{candidates[0]?.name}&rdquo;
                </span>
                ?
              </p>
            )}

            {hasDirectory && (
              <p className="mt-2 text-xs text-destructive font-medium leading-relaxed">
                {isMultiple
                  ? "Selected directories and all their contents will be permanently deleted."
                  : "This directory and all of its contents will be permanently deleted."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={cancelDelete}
            className="cursor-pointer active:scale-95 transition-all duration-120"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            className="cursor-pointer font-medium active:scale-95 transition-all duration-120"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
