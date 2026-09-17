"use client";

import React, { useEffect, useRef } from "react";
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
    promptDelete,
    copySelected,
    cutSelected,
    pasteNode,
    duplicateNode,
    copyAbsolutePath,
    copyRelativePath,
    revealInFileManager,
    collapseAll,
    clearSelection,
    clipboard,
    refresh,
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
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [state.isOpen, onClose]);

  if (!state.isOpen) return null;

  const menuWidth = 210;
  const menuHeight = 320;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 10);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 10);

  const node = state.node;
  const isMultiSelect = selectedPaths.size > 1;
  const isFile = !isMultiSelect && node?.type === "file";
  const isDirectory = !isMultiSelect && node?.type === "directory";
  const isRootOrEmpty = !isMultiSelect && (state.isRootOrEmpty || !node);

  const handleAction = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ left: `${x}px`, top: `${y}px` }}
      className="fixed z-50 min-w-[210px] rounded-md border border-border bg-popover p-1 shadow-md text-popover-foreground text-xs select-none animate-in fade-in-0 zoom-in-95"
    >
      {/* Multi-Selection Context Menu */}
      {isMultiSelect && (
        <>
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {selectedPaths.size} Items Selected
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => copySelected())}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+C</span>
          </button>
          <button
            onClick={() => handleAction(() => cutSelected())}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5" />
              <span>Cut</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+X</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => promptDelete())}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <span className="text-[10px] text-destructive/70">Del</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => clearSelection())}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
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
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={File01Icon} className="size-3.5" />
            <span>Open</span>
          </button>
          <button
            onClick={() => handleAction(() => openToSide(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
            <span>Open to Side</span>
          </button>
          <button
            onClick={() => handleAction(() => revealInFileManager(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
            <span>Reveal in File Manager</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => copyAbsolutePath(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            <span>Copy Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copyRelativePath(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            <span>Copy Relative Path</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => startRename(node))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5" />
              <span>Rename</span>
            </div>
            <span className="text-[10px] text-muted-foreground">F2</span>
          </button>
          <button
            onClick={() => handleAction(() => duplicateNode(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            <span>Duplicate</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => copySelected([node]))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+C</span>
          </button>
          <button
            onClick={() => handleAction(() => cutSelected([node]))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5" />
              <span>Cut</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+X</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => promptDelete(node))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <span className="text-[10px] text-destructive/70">Del</span>
          </button>
        </>
      )}

      {/* Single Directory Context Menu */}
      {isDirectory && node && (
        <>
          <button
            onClick={() => handleAction(() => startCreateFile(node.path))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
            <span>New File...</span>
          </button>
          <button
            onClick={() => handleAction(() => startCreateFolder(node.path))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
            <span>New Folder...</span>
          </button>
          <button
            onClick={() => handleAction(() => revealInFileManager(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
            <span>Reveal in File Manager</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => copyAbsolutePath(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            <span>Copy Path</span>
          </button>
          <button
            onClick={() => handleAction(() => copyRelativePath(node))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={Copy02Icon} className="size-3.5" />
            <span>Copy Relative Path</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => copySelected([node]))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+C</span>
          </button>
          <button
            onClick={() => handleAction(() => cutSelected([node]))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ScissorsIcon} className="size-3.5" />
              <span>Cut</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+X</span>
          </button>
          <button
            disabled={!clipboard}
            onClick={() => handleAction(() => pasteNode(node))}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
              clipboard
                ? "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ClipboardPasteIcon} className="size-3.5" />
              <span>Paste</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+V</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => startRename(node))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5" />
              <span>Rename</span>
            </div>
            <span className="text-[10px] text-muted-foreground">F2</span>
          </button>
          <button
            onClick={() => handleAction(() => promptDelete(node))}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              <span>Delete</span>
            </div>
            <span className="text-[10px] text-destructive/70">Del</span>
          </button>
        </>
      )}

      {/* Root or Empty Background Context Menu */}
      {isRootOrEmpty && activeWorkspace && (
        <>
          <button
            onClick={() => handleAction(() => startCreateFile(activeWorkspace.rootPath))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={FileAddIcon} className="size-3.5" />
            <span>New File...</span>
          </button>
          <button
            onClick={() => handleAction(() => startCreateFolder(activeWorkspace.rootPath))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
            <span>New Folder...</span>
          </button>
          <button
            disabled={!clipboard}
            onClick={() => handleAction(() => pasteNode(null))}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
              clipboard
                ? "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={ClipboardPasteIcon} className="size-3.5" />
              <span>Paste</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ctrl+V</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => collapseAll())}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={CollapseIcon} className="size-3.5" />
            <span>Collapse All Folders</span>
          </button>
          <button
            onClick={() => handleAction(() => refresh())}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
            <span>Refresh</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => handleAction(() => closeWorkspace())}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            <span>Close Workspace</span>
          </button>
        </>
      )}
    </div>
  );
}
