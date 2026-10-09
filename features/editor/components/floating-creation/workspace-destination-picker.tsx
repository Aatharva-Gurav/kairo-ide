"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import {
  X,
  File,
  Folder,
  FilePlus,
  FolderPlus,
  Search,
  Loader2,
  AlertCircle,
  FolderCheck,
} from "lucide-react";
import { CreationType } from "./types";
import { validateCreationInput } from "./validation";
import { useDestinationTree } from "./use-destination-tree";
import { DestinationFolderTree } from "./destination-folder-tree";
import { useFileExplorer } from "@/features/file-explorer/store";
import { useEditor } from "@/features/editor/store";
import { useWorkspace } from "@/features/workspace/store";
import { FileExplorerService } from "@/features/file-explorer/service";
import { ideEvents } from "@/lib/events";
import {
  normalizePath,
  joinPath,
  relativePath,
  pathExists,
  isTauriEnvironment,
} from "@/lib/tauri-ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface WorkspaceDestinationPickerProps {
  isOpen: boolean;
  initialType?: CreationType;
  onClose: () => void;
}

export function WorkspaceDestinationPicker({
  isOpen,
  initialType = "file",
  onClose,
}: WorkspaceDestinationPickerProps) {
  const { activeWorkspace } = useWorkspace();
  const { nodes: explorerNodes, refresh: refreshExplorer } = useFileExplorer();
  const { openDocument } = useEditor();

  const [creationType, setCreationType] = useState<CreationType>(initialType);
  const [itemName, setItemName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Reset type when initialType changes
  useEffect(() => {
    setCreationType(initialType);
  }, [initialType]);

  // Reset form when opened or closed
  useEffect(() => {
    if (isOpen) {
      setItemName("");
      setSubmissionError(null);
      setDuplicateWarning(null);
      // Focus input on open
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const workspaceRoot = activeWorkspace?.rootPath || "";
  const workspaceName = activeWorkspace?.name || "Workspace";

  const {
    normRoot,
    selectedPath,
    setSelectedPath,
    expandedPaths,
    loadingPaths,
    filterQuery,
    setFilterQuery,
    filteredTree,
    toggleExpand,
  } = useDestinationTree({
    workspaceRootPath: workspaceRoot,
    workspaceName,
    explorerNodes,
    isOpen,
  });

  // Real-time validation
  const validation = validateCreationInput(
    itemName,
    creationType,
    selectedPath,
    workspaceRoot
  );

  // Debounced duplicate check
  useEffect(() => {
    const trimmed = itemName.trim();
    if (!trimmed || !validation.valid || !workspaceRoot || !selectedPath) {
      setDuplicateWarning(null);
      return;
    }

    let isCancelled = false;
    const targetPath = joinPath(selectedPath, trimmed);

    const timer = setTimeout(async () => {
      try {
        if (isTauriEnvironment()) {
          const exists = await pathExists(targetPath);
          if (!isCancelled && exists) {
            setDuplicateWarning(
              `An item named "${trimmed}" already exists in this folder.`
            );
            return;
          }
        }
      } catch {
        // Ignore check failure
      }
      if (!isCancelled) {
        setDuplicateWarning(null);
      }
    }, 180);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [itemName, selectedPath, workspaceRoot, validation.valid]);

  // Keyboard navigation & outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Form submission handler
  const handleConfirm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validation.valid || isSubmitting || !workspaceRoot) return;
    const cleanName = itemName.trim();
    if (!cleanName) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      if (creationType === "file") {
        const newFilePath = await FileExplorerService.createFile(
          selectedPath,
          cleanName
        );
        await refreshExplorer(selectedPath);
        ideEvents.emit("file:created", {
          path: newFilePath,
          name: cleanName,
          isDirectory: false,
        });
        // Open the newly created file in the editor
        await openDocument(newFilePath);
      } else {
        const newDirPath = await FileExplorerService.createDirectory(
          selectedPath,
          cleanName
        );
        await refreshExplorer(selectedPath);
        ideEvents.emit("file:created", {
          path: newDirPath,
          name: cleanName,
          isDirectory: true,
        });
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create item.";
      setSubmissionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Compute clean relative display path
  const relPath = relativePath(normRoot, selectedPath);
  const displayDest = relPath ? `/${relPath}` : "/";
  const previewPath = itemName.trim()
    ? `${displayDest === "/" ? "" : displayDest}/${itemName.trim()}`
    : null;

  const isFormValid = validation.valid && !duplicateWarning && !isSubmitting;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="creation-panel-title"
      className={cn(
        "absolute bottom-16 right-0 z-50 w-[380px] max-w-[calc(100vw-32px)] flex flex-col",
        "rounded-2xl border border-border/80 bg-popover/98 text-popover-foreground shadow-2xl backdrop-blur-xl",
        "ring-1 ring-black/5 dark:ring-white/10 select-none overflow-hidden",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-180 ease-out"
      )}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
        <div className="flex flex-col min-w-0">
          <h2
            id="creation-panel-title"
            className="text-xs font-semibold tracking-tight text-foreground"
          >
            Create in workspace
          </h2>
          <p className="text-[10.5px] text-muted-foreground leading-snug">
            Choose where to add your new item
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Creation Type Selector (Segmented Control) */}
      <div className="p-3 pb-2">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border/40 gap-1">
          <button
            type="button"
            onClick={() => {
              setCreationType("file");
              inputRef.current?.focus();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-140",
              creationType === "file"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <File className="size-3.5" />
            <span>New File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreationType("folder");
              inputRef.current?.focus();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-140",
              creationType === "folder"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Folder className="size-3.5" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Destination Folder Picker Section */}
      <div className="px-3 py-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span className="font-sans">Destination Folder</span>
          <span className="text-[10px] font-mono text-muted-foreground/80 truncate max-w-[170px]">
            {displayDest}
          </span>
        </div>

        {/* Folder search input */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search folders..."
            className="w-full h-7 pl-8 pr-2.5 rounded-lg text-xs bg-muted/40 border border-border/50 text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary/50 transition-colors font-sans"
          />
        </div>

        {/* Scrollable Folder Tree Viewport */}
        <div className="max-h-36 overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-1.5">
          <DestinationFolderTree
            workspaceName={workspaceName}
            workspaceRootPath={workspaceRoot}
            folders={filteredTree}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            expandedPaths={expandedPaths}
            loadingPaths={loadingPaths}
            onToggleExpand={toggleExpand}
          />
        </div>
      </div>

      {/* Item Name Input */}
      <form onSubmit={handleConfirm} className="p-3 pt-2 flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-[11px] font-medium text-muted-foreground flex items-center gap-1"
        >
          {creationType === "file" ? (
            <>
              <FilePlus className="size-3 text-primary" />
              <span>File Name</span>
            </>
          ) : (
            <>
              <FolderPlus className="size-3 text-primary" />
              <span>Folder Name</span>
            </>
          )}
        </label>

        <div className="relative flex items-center">
          <Input
            id={inputId}
            ref={inputRef}
            type="text"
            value={itemName}
            onChange={(e) => {
              setItemName(e.target.value);
              setSubmissionError(null);
            }}
            placeholder={
              creationType === "file"
                ? "e.g. page.tsx, styles.css"
                : "e.g. components, utils"
            }
            className="h-8 text-xs font-mono pr-7"
            autoComplete="off"
            spellCheck={false}
          />
          {itemName.trim() && (
            <button
              type="button"
              onClick={() => setItemName("")}
              className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Inline Validation / Error feedback */}
        {submissionError ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{submissionError}</span>
          </div>
        ) : duplicateWarning ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{duplicateWarning}</span>
          </div>
        ) : !validation.valid && itemName.trim().length > 0 ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{validation.error}</span>
          </div>
        ) : null}

        {/* Target Path Preview */}
        {previewPath && isFormValid && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 text-[10px] text-muted-foreground font-mono truncate">
            <FolderCheck className="size-3 text-primary shrink-0" />
            <span className="truncate">Will create: {previewPath}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50 mt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-7 text-xs font-medium cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            size="sm"
            disabled={!isFormValid}
            className="h-7 text-xs font-semibold cursor-pointer shadow-xs gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>{creationType === "file" ? "Create File" : "Create Folder"}</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

