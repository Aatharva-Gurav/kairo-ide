"use client";

import React, { useState, useEffect, useRef, useId, useMemo } from "react";
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
  ChevronRight,
  HardDrive,
  RotateCcw,
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
import { FileIcon } from "@/features/icon-theme";
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

const COMMON_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"];

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

  // Reset form and focus on open
  useEffect(() => {
    if (isOpen) {
      setItemName("");
      setSubmissionError(null);
      setDuplicateWarning(null);
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
      const isFabClick = Boolean(
        (e.target as HTMLElement)?.closest?.('[data-floating-fab="true"]')
      );
      if (isFabClick) {
        // Main FAB handles closing and canceling creation
        return;
      }
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
        // Open newly created file in Monaco editor
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

  // Interactive Breadcrumb Navigation
  const breadcrumbs = useMemo(() => {
    const rel = relativePath(normRoot, selectedPath);
    if (!rel) return [];

    const segments = rel.split("/").filter(Boolean);
    const crumbs: { name: string; fullPath: string }[] = [];
    let currentAcc = normRoot;

    for (const segment of segments) {
      currentAcc = joinPath(currentAcc, segment);
      crumbs.push({ name: segment, fullPath: currentAcc });
    }
    return crumbs;
  }, [normRoot, selectedPath]);

  if (!isOpen) return null;

  // Clean relative display path
  const relPath = relativePath(normRoot, selectedPath);
  const displayDest = relPath ? `/${relPath}` : "/";
  const previewPath = itemName.trim()
    ? `${displayDest === "/" ? "" : displayDest}/${itemName.trim()}`
    : null;

  const isFormValid = validation.valid && !duplicateWarning && !isSubmitting;
  const hasExtension = itemName.includes(".");

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="creation-panel-title"
      className={cn(
        "absolute bottom-13 right-0 z-50 w-[380px] max-w-[calc(100vw-28px)] flex flex-col",
        "rounded-2xl border border-border/80 bg-popover/98 text-popover-foreground shadow-2xl backdrop-blur-xl",
        "ring-1 ring-black/5 dark:ring-white/10 select-none overflow-hidden",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-180 ease-out"
      )}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 shadow-2xs">
            {creationType === "file" ? (
              <FilePlus className="size-3.5" />
            ) : (
              <FolderPlus className="size-3.5" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <h2
              id="creation-panel-title"
              className="text-xs font-semibold tracking-tight text-foreground truncate"
            >
              Create {creationType === "file" ? "New File" : "New Folder"}
            </h2>
            <span className="text-[10px] text-muted-foreground truncate font-mono">
              in {displayDest}
            </span>
          </div>
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

      {/* Creation Type Selector (Segmented Tabs) */}
      <div className="px-3 pt-2 pb-1">
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-muted/60 border border-border/40 gap-1">
          <button
            type="button"
            onClick={() => {
              setCreationType("file");
              inputRef.current?.focus();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-120",
              creationType === "file"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <File className="size-3" />
            <span>New File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreationType("folder");
              inputRef.current?.focus();
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-120",
              creationType === "folder"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Folder className="size-3" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Destination Folder Section */}
      <div className="px-3 py-1 flex flex-col gap-1.5">
        {/* Interactive Breadcrumb Bar */}
        <div className="flex items-center justify-between text-[10.5px] font-medium text-muted-foreground">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-[280px]">
            <button
              type="button"
              onClick={() => setSelectedPath(normRoot)}
              className={cn(
                "hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-muted/60 font-sans flex items-center gap-1",
                selectedPath === normRoot ? "text-primary font-semibold" : ""
              )}
            >
              <HardDrive className="size-2.5" />
              <span>root</span>
            </button>
            {breadcrumbs.map((crumb) => (
              <React.Fragment key={crumb.fullPath}>
                <ChevronRight className="size-2.5 text-muted-foreground/60 shrink-0" />
                <button
                  type="button"
                  onClick={() => setSelectedPath(crumb.fullPath)}
                  className={cn(
                    "hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-muted/60 font-mono truncate max-w-[80px]",
                    selectedPath === crumb.fullPath ? "text-primary font-semibold" : ""
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {selectedPath !== normRoot && (
            <button
              type="button"
              onClick={() => setSelectedPath(normRoot)}
              title="Reset to workspace root"
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 cursor-pointer hover:bg-muted/60 px-1 py-0.5 rounded transition-colors"
            >
              <RotateCcw className="size-2.5" />
              <span>Root</span>
            </button>
          )}
        </div>

        {/* Folder search input */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 size-3 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search folders..."
            className="w-full h-6.5 pl-7 pr-6 rounded-md text-[11px] bg-muted/40 border border-border/50 text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary/50 transition-colors font-sans"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="absolute right-1.5 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>

        {/* Scrollable Folder Tree Viewport */}
        <div className="max-h-32 overflow-y-auto rounded-lg border border-border/50 bg-background/50 p-1">
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

      {/* Item Name Input with Live File Icon Preview */}
      <form onSubmit={handleConfirm} className="px-3 pt-1.5 pb-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <label htmlFor={inputId} className="flex items-center gap-1.5">
            <span>{creationType === "file" ? "File Name" : "Folder Name"}</span>
          </label>
        </div>

        <div className="relative flex items-center">
          {/* Live Icon resolved dynamically from the typed filename */}
          <div className="absolute left-2.5 pointer-events-none flex items-center justify-center size-3.5">
            {creationType === "file" ? (
              <FileIcon
                name={itemName.trim() || "file.txt"}
                className="size-3.5"
              />
            ) : (
              <FileIcon
                name={itemName.trim() || "folder"}
                isDirectory={true}
                isExpanded={false}
                className="size-3.5"
              />
            )}
          </div>

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
                ? "e.g. index.tsx, styles.css"
                : "e.g. components, utils"
            }
            className="h-7.5 text-xs font-mono pl-8 pr-7"
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

        {/* Quick extension chips for files */}
        {creationType === "file" && !hasExtension && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] text-muted-foreground/70 font-sans mr-0.5">
              Quick:
            </span>
            {COMMON_EXTENSIONS.map((ext) => (
              <button
                key={ext}
                type="button"
                onClick={() => {
                  setItemName((prev) => (prev.trim() ? `${prev.trim()}${ext}` : `index${ext}`));
                  inputRef.current?.focus();
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/50 hover:bg-primary/10 hover:text-primary text-muted-foreground border border-border/40 transition-colors cursor-pointer"
              >
                {ext}
              </button>
            ))}
          </div>
        )}

        {/* Inline Validation / Error feedback */}
        {submissionError ? (
          <div className="flex items-center gap-1 text-[10.5px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{submissionError}</span>
          </div>
        ) : duplicateWarning ? (
          <div className="flex items-center gap-1 text-[10.5px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{duplicateWarning}</span>
          </div>
        ) : !validation.valid && itemName.trim().length > 0 ? (
          <div className="flex items-center gap-1 text-[10.5px] text-destructive animate-in fade-in-50 duration-150">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{validation.error}</span>
          </div>
        ) : null}

        {/* Target Path Preview */}
        {previewPath && isFormValid && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/40 text-[9.5px] text-muted-foreground font-mono truncate">
            <FolderCheck className="size-3 text-primary shrink-0" />
            <span className="truncate">Will create: {previewPath}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-border/50 mt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-6.5 text-[11px] font-medium cursor-pointer px-2"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            size="sm"
            disabled={!isFormValid}
            className="h-6.5 text-[11px] font-semibold cursor-pointer shadow-xs gap-1.5 px-2.5"
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
