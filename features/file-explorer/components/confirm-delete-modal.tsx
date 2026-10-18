"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import { AlertTriangle, Trash2, X } from "lucide-react";

export function ConfirmDeleteModal() {
  const { bulkDeleteCandidate, deleteCandidate, cancelDelete, confirmDelete } =
    useFileExplorer();

  const candidates = bulkDeleteCandidate || (deleteCandidate ? [deleteCandidate] : []);
  const isOpen = candidates.length > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelDelete();
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmDelete();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, cancelDelete, confirmDelete]);

  if (!isOpen || typeof document === "undefined") return null;

  const isMultiple = candidates.length > 1;
  const hasDirectory = candidates.some((n) => n.type === "directory");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-popover/98 dark:bg-[#1a1a1a]/98 p-4 shadow-2xl backdrop-blur-md text-popover-foreground animate-in zoom-in-95 duration-150 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 id="delete-dialog-title" className="text-sm font-semibold tracking-tight text-foreground truncate">
                {isMultiple
                  ? `Delete ${candidates.length} items?`
                  : `Delete ${hasDirectory ? "directory" : "file"}?`}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={cancelDelete}
            title="Close (Esc)"
            className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors shrink-0 ml-2"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Candidate Items Preview */}
        <div className="my-3 space-y-2.5">
          {isMultiple ? (
            <div>
              <div className="text-[11px] text-muted-foreground mb-1.5">
                Are you sure you want to permanently delete these {candidates.length} items?
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg bg-background/60 border border-border/60 p-1.5 space-y-1 divide-y divide-border/20">
                {candidates.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/90 rounded hover:bg-muted/40 transition-colors"
                  >
                    <FileIcon
                      name={item.name}
                      isDirectory={item.type === "directory"}
                      className="w-[17px] h-[13.5px] shrink-0"
                    />
                    <span className="font-mono text-[11px] truncate flex-1">
                      {item.name}
                    </span>
                    {item.type === "directory" && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        Folder
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
              <FileIcon
                name={candidates[0]?.name || ""}
                isDirectory={candidates[0]?.type === "directory"}
                className="w-[17px] h-[13.5px] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono font-medium text-foreground truncate text-xs">
                  {candidates[0]?.name}
                </div>
                {candidates[0]?.path && (
                  <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                    {candidates[0].path.replace(/\\/g, "/")}
                  </div>
                )}
              </div>
            </div>
          )}

          {hasDirectory && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span className="text-[11px]">
                {isMultiple
                  ? "Selected directories and all their subfiles will be permanently removed from disk."
                  : "This directory and all of its contents will be permanently removed from disk."}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2.5 flex items-center justify-between border-t border-border/50 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono">↵</kbd>
            <span>Delete</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[10px] font-mono ml-1.5">esc</kbd>
            <span>Cancel</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelDelete}
              className="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              className="h-7 px-3 text-xs rounded-md font-medium cursor-pointer shadow-2xs"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
