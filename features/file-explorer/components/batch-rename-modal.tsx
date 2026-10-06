"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { FileExplorerService } from "../service";
import { BatchRenameMode, BatchRenamePreviewItem } from "../types";
import { dirname } from "@/lib/tauri-ipc";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
} from "lucide-react";

export function BatchRenameModal() {
  const { batchRenameCandidates, closeBatchRename, refresh } = useFileExplorer();

  const candidates = batchRenameCandidates;
  const isOpen = candidates !== null && candidates.length > 0;

  const [mode, setMode] = useState<BatchRenameMode>("find-replace");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [numberingPattern, setNumberingPattern] = useState("{name}_{n}");
  const [startNumber, setStartNumber] = useState(1);
  const [padZeros, setPadZeros] = useState(1);
  const [preserveExtension, setPreserveExtension] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeBatchRename();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, closeBatchRename]);

  const previewItems: BatchRenamePreviewItem[] = useMemo(() => {
    if (!candidates || candidates.length === 0) return [];
    return FileExplorerService.generateBatchRenamePreview(candidates, {
      mode,
      find,
      replace,
      caseSensitive,
      prefix,
      suffix,
      numberingPattern,
      startNumber,
      padZeros,
      preserveExtension,
    });
  }, [
    candidates,
    mode,
    find,
    replace,
    caseSensitive,
    prefix,
    suffix,
    numberingPattern,
    startNumber,
    padZeros,
    preserveExtension,
  ]);

  const conflicts = useMemo(
    () => previewItems.filter((i) => i.hasConflict),
    [previewItems]
  );
  const changesCount = useMemo(
    () => previewItems.filter((i) => i.originalName !== i.newName).length,
    [previewItems]
  );
  const hasConflicts = conflicts.length > 0;

  if (!isOpen || !candidates || typeof document === "undefined") return null;

  const handleApply = async () => {
    if (hasConflicts || changesCount === 0 || isApplying) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      await FileExplorerService.executeBatchRename(previewItems);

      const parents = new Set<string>();
      candidates.forEach((c) => parents.add(dirname(c.path)));
      for (const p of parents) {
        await refresh(p);
      }
      closeBatchRename();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute batch rename.";
      setErrorMsg(msg);
    } finally {
      setIsApplying(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-2xl rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 ease-out flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-rename-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Pencil className="size-4" />
            </div>
            <div>
              <h3 id="batch-rename-title" className="text-sm font-semibold tracking-tight text-foreground">
                Batch Rename
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Renaming {candidates.length} selected items
              </p>
            </div>
          </div>
          <button
            onClick={closeBatchRename}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setMode("find-replace")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === "find-replace"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Find &amp; Replace
          </button>
          <button
            type="button"
            onClick={() => setMode("prefix-suffix")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === "prefix-suffix"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Prefix &amp; Suffix
          </button>
          <button
            type="button"
            onClick={() => setMode("numbering")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              mode === "numbering"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            Sequential Numbering
          </button>
        </div>

        {/* Input Parameters based on Mode */}
        <div className="py-2.5 space-y-3 shrink-0">
          {mode === "find-replace" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Find
                </label>
                <input
                  type="text"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Text to match"
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Replace with
                </label>
                <input
                  type="text"
                  value={replace}
                  onChange={(e) => setReplace(e.target.value)}
                  placeholder="Replacement text"
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="caseSensitive"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="size-3.5 rounded border-input cursor-pointer"
                />
                <label htmlFor="caseSensitive" className="text-xs text-muted-foreground cursor-pointer">
                  Match case
                </label>
              </div>
            </div>
          )}

          {mode === "prefix-suffix" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Prefix (add to beginning)
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="e.g. new_"
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Suffix (add before extension)
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="e.g. _v2"
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {mode === "numbering" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Pattern
                </label>
                <input
                  type="text"
                  value={numberingPattern}
                  onChange={(e) => setNumberingPattern(e.target.value)}
                  placeholder="{name}_{n}"
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  autoFocus
                />
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  Use &#123;name&#125; and &#123;n&#125;
                </span>
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Start Number
                </label>
                <input
                  type="number"
                  min={0}
                  value={startNumber}
                  onChange={(e) => setStartNumber(parseInt(e.target.value) || 0)}
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground block mb-1">
                  Zero Padding
                </label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={padZeros}
                  onChange={(e) => setPadZeros(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-8 rounded-md bg-background border border-input px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Common Option: Preserve Extension */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <input
              type="checkbox"
              id="preserveExt"
              checked={preserveExtension}
              onChange={(e) => setPreserveExtension(e.target.checked)}
              className="size-3.5 rounded border-input cursor-pointer"
            />
            <label htmlFor="preserveExt" className="text-xs text-muted-foreground cursor-pointer">
              Preserve file extensions
            </label>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-2 p-2 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-1.5 shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Live Preview List */}
        <div className="flex-1 min-h-[160px] overflow-hidden flex flex-col rounded-lg border border-border/60 bg-muted/20 my-2">
          <div className="grid grid-cols-[1fr_24px_1fr_90px] gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/60 text-[11px] font-semibold text-muted-foreground shrink-0">
            <span>Original</span>
            <span />
            <span>New Name</span>
            <span className="text-right">Status</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/30 text-xs">
            {previewItems.map((item) => {
              const isChanged = item.originalName !== item.newName;
              return (
                <div
                  key={item.node.path}
                  className={`grid grid-cols-[1fr_24px_1fr_90px] gap-2 px-3 py-1.5 items-center transition-colors ${
                    item.hasConflict ? "bg-destructive/10" : ""
                  }`}
                >
                  <span className="truncate text-foreground/80 font-mono text-[11px]" title={item.originalName}>
                    {item.originalName}
                  </span>
                  <ArrowRight
                    className="size-3 text-muted-foreground shrink-0"
                  />
                  <span
                    className={`truncate font-mono text-[11px] ${
                      item.hasConflict
                        ? "text-destructive font-semibold"
                        : isChanged
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }`}
                    title={item.newName}
                  >
                    {item.newName}
                  </span>
                  <div className="text-right">
                    {item.hasConflict ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-destructive bg-destructive/15 px-1.5 py-0.5 rounded font-medium"
                        title={item.conflictReason}
                      >
                        <AlertCircle className="size-3" />
                        Conflict
                      </span>
                    ) : isChanged ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                        <CheckCircle2 className="size-3" />
                        Rename
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Unchanged</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Summary & Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-border/60 shrink-0">
          <div className="text-xs text-muted-foreground">
            {hasConflicts ? (
              <span className="text-destructive font-medium flex items-center gap-1">
                <AlertCircle className="size-3.5" />
                {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} detected. Resolve before applying.
              </span>
            ) : changesCount > 0 ? (
              <span className="text-foreground">
                {changesCount} of {candidates.length} item{candidates.length > 1 ? "s" : ""} will be renamed
              </span>
            ) : (
              <span>No changes made yet</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeBatchRename}
              disabled={isApplying}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={hasConflicts || changesCount === 0 || isApplying}
              className="cursor-pointer"
            >
              {isApplying ? "Renaming..." : `Apply (${changesCount})`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

