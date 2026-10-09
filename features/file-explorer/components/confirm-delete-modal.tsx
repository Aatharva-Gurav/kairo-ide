"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { Button } from "@/components/ui/button";
import { AlertCircle, Trash2, X } from "lucide-react";

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

  if (!isOpen || typeof document === "undefined") return null;

  const isMultiple = candidates.length > 1;
  const hasDirectory = candidates.some((n) => n.type === "directory");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in-0 duration-200 ease-out">
      <div
        className="w-full max-w-md rounded-2xl border border-border/70 dark:border-white/10 bg-card/98 dark:bg-[#1e1e1e]/98 p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl text-card-foreground animate-in zoom-in-95 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
              <Trash2 className="size-5" />
            </div>
            <div>
              <h3 id="delete-dialog-title" className="text-base font-semibold tracking-tight text-foreground">
                {isMultiple
                  ? `Delete ${candidates.length} items?`
                  : `Delete ${hasDirectory ? "directory" : "file"}?`}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={cancelDelete}
            className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-pointer transition-all"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3">
          {isMultiple ? (
            <div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to permanently delete these {candidates.length} items?
              </p>
              <div className="mt-2.5 max-h-28 overflow-y-auto rounded-xl bg-muted/30 border border-border/60 p-3 text-[11px] font-mono space-y-1">
                {candidates.slice(0, 5).map((item) => (
                  <div key={item.path} className="truncate text-foreground/90 flex items-center gap-1.5">
                    <span className="size-1 rounded-full bg-destructive/60" />
                    <span>{item.name}</span>
                  </div>
                ))}
                {candidates.length > 5 && (
                  <div className="text-muted-foreground italic pl-2.5 pt-0.5 text-[10px]">
                    +{candidates.length - 5} more items
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                &ldquo;{candidates[0]?.name}&rdquo;
              </span>
              ?
            </p>
          )}

          {hasDirectory && (
            <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                {isMultiple
                  ? "Selected directories and all their contents will be permanently deleted."
                  : "This directory and all of its contents will be permanently deleted."}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={cancelDelete}
            className="rounded-xl cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            className="rounded-xl cursor-pointer font-medium shadow-xs"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
