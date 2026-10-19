"use client";

import React, { useState, useRef, useEffect } from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { X, Copy, Compass, FolderX, ListFilter } from "lucide-react";
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
          "group relative flex h-[28px] shrink-0 items-center gap-1.5 px-2.5 mx-0.5 rounded-md text-[12px] cursor-pointer select-none transition-all duration-120 font-sans tracking-tight",
          isActive
            ? "bg-background text-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] border border-border/80 dark:bg-[#1f1f23] z-10"
            : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 border border-transparent"
        )}
      >
        <FileIcon
          name={document.title}
          isDirectory={false}
          className="size-3.5 shrink-0 transition-transform duration-120 group-hover:scale-105"
        />
        <span className="truncate max-w-[150px]">{document.title}</span>

        {/* Notion-style Dirty indicator or smooth close button */}
        <div className="flex items-center justify-center size-4 shrink-0 relative ml-0.5">
          {document.isDirty ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Unsaved changes - click to close"
              className="size-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20 group-hover:hidden transition-all duration-150 animate-pulse cursor-pointer"
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
              "rounded-full p-0.5 hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-100 active:scale-90",
              document.isDirty ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
              isActive && !document.isDirty && "opacity-70 hover:opacity-100"
            )}
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Notion-style Tab Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            boxShadow: "var(--shadow-elevation-high)",
          }}
          className="fixed z-50 min-w-[190px] rounded-xl border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left"
        >
          <button
            onClick={() => {
              onClose();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <X className="size-3.5 text-muted-foreground" />
            <span>Close</span>
          </button>
          <button
            onClick={() => {
              closeOtherDocuments(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <ListFilter className="size-3.5 text-muted-foreground" />
            <span>Close Others</span>
          </button>
          <button
            onClick={() => {
              closeAllDocuments();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100 text-destructive hover:text-destructive"
          >
            <FolderX className="size-3.5" />
            <span>Close All</span>
          </button>
          <div className="h-px bg-border/70 my-1 mx-1" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <Copy className="size-3.5 text-muted-foreground" />
            <span>Copy Absolute Path</span>
          </button>
          <button
            onClick={() => {
              revealInExplorer(document.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <Compass className="size-3.5 text-muted-foreground" />
            <span>Reveal in Explorer</span>
          </button>
        </div>
      )}
    </>
  );
}
