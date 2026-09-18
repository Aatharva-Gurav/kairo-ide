"use client";

import React, { useState, useRef, useEffect } from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface EditorTabProps {
  document: EditorDocument;
  isActive: boolean;
  onSelect: () => void;
  onClose: (force?: boolean) => void;
}

export function EditorTab({ document, isActive, onSelect, onClose }: EditorTabProps) {
  const { closeOtherDocuments, closeAllDocuments, revealInExplorer } = useEditor();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      // Middle-click closes tab
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div
        role="tab"
        aria-selected={isActive}
        onClick={onSelect}
        onAuxClick={handleAuxClick}
        onContextMenu={handleContextMenu}
        title={document.path}
        className={cn(
          "group relative flex h-9 shrink-0 items-center gap-2 border-r border-border px-3 text-xs cursor-pointer select-none transition-colors",
          isActive
            ? "bg-background text-foreground border-t-2 border-t-sidebar-primary font-medium"
            : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground border-t-2 border-t-transparent"
        )}
      >
        <FileIcon name={document.title} isDirectory={false} className="size-3.5 shrink-0" />
        <span className="truncate max-w-[140px]">{document.title}</span>

        {/* Dirty indicator or close button */}
        <div className="flex items-center justify-center size-4 shrink-0">
          {document.isDirty ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Unsaved changes - click to close"
              className="size-2 rounded-full bg-sidebar-primary group-hover:hidden"
            />
          ) : null}

          <button
            type="button"
            aria-label={`Close ${document.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              "rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-opacity",
              document.isDirty ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
              isActive && !document.isDirty && "opacity-70 hover:opacity-100"
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        </div>
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md text-xs text-popover-foreground animate-in fade-in-50 zoom-in-95"
        >
          <button
            onClick={() => {
              onClose();
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
          >
            Close
          </button>
          <button
            onClick={() => {
              closeOtherDocuments(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
          >
            Close Others
          </button>
          <button
            onClick={() => {
              closeAllDocuments();
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
          >
            Close All
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
          >
            Copy Absolute Path
          </button>
          <button
            onClick={() => {
              revealInExplorer(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
          >
            Reveal in Explorer
          </button>
        </div>
      )}
    </>
  );
}

