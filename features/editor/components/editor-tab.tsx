"use client";

import React, { useState, useRef, useEffect } from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { X } from "lucide-react";
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
          "group relative flex h-full shrink-0 items-center gap-2 border-r border-border/60 px-3 text-[12px] cursor-pointer select-none transition-colors duration-100 font-sans",
          isActive
            ? "bg-background text-foreground font-medium border-t-2 border-t-primary border-r-border/80 border-b-transparent z-10"
            : "bg-sidebar/40 dark:bg-[#181818]/60 text-muted-foreground/80 hover:bg-sidebar/70 dark:hover:bg-[#1f1f1f] hover:text-foreground border-t-2 border-t-transparent"
        )}
      >
        <FileIcon
          name={document.title}
          isDirectory={false}
          className="size-3.5 shrink-0 transition-transform duration-100 group-hover:scale-105"
        />
        <span className="truncate max-w-[150px] tracking-tight">{document.title}</span>

        {/* Dirty indicator or close button */}
        <div className="flex items-center justify-center size-4 shrink-0 relative ml-0.5">
          {document.isDirty ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Unsaved changes - click to close"
              className="size-2 rounded-full bg-primary/90 group-hover:hidden transition-all duration-150 animate-kairo-pulse shadow-xs cursor-pointer"
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
              "rounded-sm p-0.5 hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-100 active:scale-90",
              document.isDirty ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
              isActive && !document.isDirty && "opacity-70 hover:opacity-100"
            )}
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            boxShadow: "var(--shadow-elevation-high)",
          }}
          className="fixed z-50 min-w-[180px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left"
        >
          <button
            onClick={() => {
              onClose();
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            Close
          </button>
          <button
            onClick={() => {
              closeOtherDocuments(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            Close Others
          </button>
          <button
            onClick={() => {
              closeAllDocuments();
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            Close All
          </button>
          <div className="h-px bg-border/70 my-1 mx-1" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            Copy Absolute Path
          </button>
          <button
            onClick={() => {
              revealInExplorer(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center px-2.5 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            Reveal in Explorer
          </button>
        </div>
      )}
    </>
  );
}
