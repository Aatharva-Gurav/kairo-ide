"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ContextMenuState } from "../types";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileAddIcon,
  FolderAddIcon,
  Edit02Icon,
  Delete02Icon,
  Copy01Icon,
  Copy02Icon,
  ScissorsIcon,
  ClipboardPasteIcon,
  RefreshIcon,
  Cancel01Icon,
  File01Icon,
  Folder01Icon,
  ArrowRight01Icon,
  CollapseIcon,
  CursorMove01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export function ContextMenu({ state, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    selectedPaths,
    openFile,
    openToSide,
    startCreateFile,
    startCreateFolder,
    startRename,
    startBatchRename,
    promptDelete,
    copySelected,
    cutSelected,
    pasteNode,
    duplicateNode,
    duplicateSelected,
    startMove,
    copyAbsolutePath,
    copyRelativePath,
    copySelectedPaths,
    revealInFileManager,
    collapseAll,
    clearSelection,
    clipboard,
    refresh,
    openProperties,
  } = useFileExplorer();

  const { activeWorkspace, closeWorkspace } = useWorkspace();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (state.isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("resize", onClose);
      window.addEventListener("blur", onClose);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("resize", onClose);
        window.removeEventListener("blur", onClose);
      };
    }
  }, [state.isOpen, onClose]);

  if (!state.isOpen || typeof document === "undefined") return null;

  const menuWidth = 230;
  const menuHeight = 440;
  const x = Math.max(10, Math.min(state.x, window.innerWidth - menuWidth - 10));
  const y = Math.max(10, Math.min(state.y, window.innerHeight - menuHeight - 10));

  const node = state.node;
  const isMultiSelect = selectedPaths.size > 1;
  const isFile = !isMultiSelect && node?.type === "file";
  const isDirectory = !isMultiSelect && node?.type === "directory";
  const isRootOrEmpty = !isMultiSelect && (state.isRootOrEmpty || !node);

  const handleAction = (fn: () => void) => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        boxShadow: "var(--shadow-elevation-high)",
      }}
      className="fixed z-[100] min-w-[220px] max-w-[280px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 text-popover-foreground text-xs select-none animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left"
    >
      {/* Multi-Selection Context Menu */}
      {isMultiSelect && (
        <>
          <div className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
            {selectedPaths.size} Items Selected
          </div>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => cutSelected())}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5 text-muted-foreground" />
              <span>Cut</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+X</kbd>
          </button>
          <button
            onClick={() => handleAction(() => copySelected())}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5 text-muted-foreground" />
              <span>Copy</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+C</kbd>
          </button>
          <button
            onClick={() => handleAction(() => duplicateSelected())}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
              <span>Duplicate</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+D</kbd>
          </button>
          <button
            onClick={() => handleAction(() => startMove())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={CursorMove01Icon} className="size-3.5 text-muted-foreground" />
            <span>Move to...</span>
          </button>
          <button
            onClick={() => handleAction(() => startBatchRename())}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5 text-muted-foreground" />
              <span>Batch Rename...</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">F2</kbd>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => copySelectedPaths("absolute"))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Full Paths</span>
          </button>
          <button
            onClick={() => handleAction(() => copySelectedPaths("relative"))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Relative Paths</span>
          </button>
          <button
            onClick={() => handleAction(() => copySelectedPaths("name"))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Names</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => promptDelete())}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/15 cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-destructive/80">Del</kbd>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => clearSelection())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            <span>Deselect All</span>
          </button>
        </>
      )}

      {/* Single File Context Menu */}
      {isFile && node && (
        <>
          <button
            onClick={() => handleAction(() => openFile(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={File01Icon} className="size-3.5 text-muted-foreground" />
            <span>Open</span>
          </button>
          <button
            onClick={() => handleAction(() => openToSide(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 text-muted-foreground" />
            <span>Open to Side</span>
          </button>
          <button
            onClick={() => handleAction(() => revealInFileManager(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5 text-muted-foreground" />
            <span>Reveal in File Manager</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => cutSelected([node]))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5 text-muted-foreground" />
              <span>Cut</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+X</kbd>
          </button>
          <button
            onClick={() => handleAction(() => copySelected([node]))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5 text-muted-foreground" />
              <span>Copy</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+C</kbd>
          </button>
          <button
            onClick={() => handleAction(() => duplicateNode(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
              <span>Duplicate</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+D</kbd>
          </button>
          <button
            onClick={() => handleAction(() => startMove([node]))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={CursorMove01Icon} className="size-3.5 text-muted-foreground" />
            <span>Move to...</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => copyAbsolutePath(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copyRelativePath(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Relative Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copySelectedPaths("name", [node]))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Filename</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => startRename(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5 text-muted-foreground" />
              <span>Rename</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">F2</kbd>
          </button>
          <button
            onClick={() => handleAction(() => promptDelete(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/15 cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-destructive/80">Del</kbd>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => openProperties(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-muted-foreground" />
            <span>Properties</span>
          </button>
        </>
      )}

      {/* Single Directory Context Menu */}
      {isDirectory && node && (
        <>
          <button
            onClick={() => handleAction(() => startCreateFile(node.path))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={FileAddIcon} className="size-3.5 text-muted-foreground" />
            <span>New File...</span>
          </button>
          <button
            onClick={() => handleAction(() => startCreateFolder(node.path))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 text-muted-foreground" />
            <span>New Folder...</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => cutSelected([node]))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5 text-muted-foreground" />
              <span>Cut</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+X</kbd>
          </button>
          <button
            onClick={() => handleAction(() => copySelected([node]))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5 text-muted-foreground" />
              <span>Copy</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+C</kbd>
          </button>
          <button
            disabled={!clipboard}
            onClick={() => handleAction(() => pasteNode(node))}
            className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors duration-100 ${
              clipboard
                ? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ClipboardPasteIcon} className="size-3.5 text-muted-foreground" />
              <span>Paste</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+V</kbd>
          </button>
          <button
            onClick={() => handleAction(() => duplicateNode(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
              <span>Duplicate</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+D</kbd>
          </button>
          <button
            onClick={() => handleAction(() => startMove([node]))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={CursorMove01Icon} className="size-3.5 text-muted-foreground" />
            <span>Move to...</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => revealInFileManager(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5 text-muted-foreground" />
            <span>Reveal in File Manager</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => copyAbsolutePath(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copyRelativePath(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Relative Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copySelectedPaths("name", [node]))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5 text-muted-foreground" />
            <span>Copy Folder Name</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => startRename(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5 text-muted-foreground" />
              <span>Rename</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">F2</kbd>
          </button>
          <button
            onClick={() => handleAction(() => promptDelete(node))}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/15 cursor-pointer transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-destructive/80">Del</kbd>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => openProperties(node))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-muted-foreground" />
            <span>Properties</span>
          </button>
        </>
      )}

      {/* Root or Empty Background Context Menu */}
      {isRootOrEmpty && activeWorkspace && (
        <>
          <button
            onClick={() => handleAction(() => startCreateFile(activeWorkspace.rootPath))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={FileAddIcon} className="size-3.5 text-muted-foreground" />
            <span>New File...</span>
          </button>
          <button
            onClick={() => handleAction(() => startCreateFolder(activeWorkspace.rootPath))}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 text-muted-foreground" />
            <span>New Folder...</span>
          </button>
          <button
            disabled={!clipboard}
            onClick={() => handleAction(() => pasteNode(null))}
            className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors duration-100 ${
              clipboard
                ? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ClipboardPasteIcon} className="size-3.5 text-muted-foreground" />
              <span>Paste</span>
            </div>
            <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+V</kbd>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => collapseAll())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={CollapseIcon} className="size-3.5 text-muted-foreground" />
            <span>Collapse All Folders</span>
          </button>
          <button
            onClick={() => handleAction(() => refresh())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-3.5 text-muted-foreground" />
            <span>Refresh</span>
          </button>
          <div className="my-1 h-px bg-border/70 mx-1" />
          <button
            onClick={() => handleAction(() => closeWorkspace())}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/15 cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            <span>Close Workspace</span>
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
