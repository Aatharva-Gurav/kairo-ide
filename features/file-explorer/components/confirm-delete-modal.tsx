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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in-0">
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg text-card-foreground animate-in zoom-in-95"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4" />
          </div>
          <div className="flex-1">
            <h3 id="delete-dialog-title" className="text-sm font-semibold">
              {isMultiple
                ? `Delete ${candidates.length} Items?`
                : `Delete ${hasDirectory ? "Directory" : "File"}?`}
            </h3>

            {isMultiple ? (
              <div className="mt-1">
                <p className="text-xs text-muted-foreground leading-normal">
                  Are you sure you want to delete these {candidates.length} items?
                </p>
                <div className="mt-2 max-h-24 overflow-y-auto rounded bg-muted/40 p-2 text-[11px] font-mono space-y-0.5">
                  {candidates.slice(0, 5).map((item) => (
                    <div key={item.path} className="truncate text-foreground/80">
                      • {item.name}
                    </div>
                  ))}
                  {candidates.length > 5 && (
                    <div className="text-muted-foreground italic">
                      + {candidates.length - 5} more items
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground leading-normal">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  &ldquo;{candidates[0]?.name}&rdquo;
                </span>
                ?
              </p>
            )}

            {hasDirectory && (
              <p className="mt-2 text-xs text-destructive font-medium leading-tight">
                {isMultiple
                  ? "Selected directories and all their contents will be permanently deleted."
                  : "This directory and all of its contents will be permanently deleted."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={cancelDelete}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            className="cursor-pointer"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
