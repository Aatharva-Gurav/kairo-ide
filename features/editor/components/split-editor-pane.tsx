"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useEditor } from "../store";
import { EditorDocument } from "../types";
import { X, ChevronRight } from "lucide-react";
import { FileIcon } from "@/features/file-explorer/components/file-icon";
import { BinaryFileView } from "./binary-file-view";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const MonacoEditorView = dynamic(
  () => import("./monaco-editor-view").then((mod) => mod.MonacoEditorView),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center h-full w-full bg-background text-xs text-muted-foreground font-mono">
        Loading editor...
      </div>
    ),
  }
);

interface SplitEditorPaneProps {
  document: EditorDocument;
  onClose?: () => void;
  onSelectDocument?: (id: string) => void;
  isVertical?: boolean;
  onCursorChange?: (
    docPath: string,
    pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
  ) => void;
}

export function SplitEditorPane({
  document,
  onClose,
  onSelectDocument,
  isVertical = false,
  onCursorChange,
}: SplitEditorPaneProps) {
  const { documents, closeSplitView, setSplitDocumentId } = useEditor();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const handleClose = onClose || closeSplitView;
  const handleSelectDoc = onSelectDocument || setSplitDocumentId;

  // Handle clicking outside or pressing Escape to close the file switcher dropdown
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDropdownOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  const parts = useMemo(() => {
    return document.path.replace(/\\/g, "/").split("/").filter(Boolean);
  }, [document.path]);

  return (
    <div
      className={cn(
        "flex flex-1 flex-col h-full w-full overflow-hidden relative bg-background",
        isVertical ? "border-t border-border/70" : "border-l border-border/70"
      )}
    >
      {/* Split Pane Header (Matching Breadcrumb h-6 height) */}
      <div className="relative z-20 shrink-0 flex h-6 w-full items-center justify-between border-b border-border/60 bg-background/80 px-2 text-[11px] text-muted-foreground select-none backdrop-blur-xs font-sans">
        {/* Left Side: Breadcrumb with file icon and path segments */}
        <div className="flex items-center gap-1 min-w-0 overflow-hidden text-[11px]">
          <FileIcon name={document.title} className="size-3.5 shrink-0" />
          {parts.slice(-3, -1).map((part, idx) => (
            <React.Fragment key={idx}>
              <span className="truncate max-w-[80px] text-muted-foreground/80">{part}</span>
              <ChevronRight className="size-2.5 opacity-50 shrink-0" />
            </React.Fragment>
          ))}
          <span className="text-foreground font-medium truncate max-w-[130px]">
            {document.title}
          </span>
        </div>

        {/* Right Side: Switch File Dropdown & Close Button */}
        <div className="flex items-center gap-1 shrink-0 relative" ref={dropdownContainerRef}>
          {/* Switch File Button */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            title="Switch Split File"
            aria-label="Switch Split File"
            className={cn(
              "h-5 px-1.5 flex items-center gap-1 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors border border-transparent hover:border-border/60 text-[11px]",
              isDropdownOpen && "bg-muted/80 text-foreground border-border/60"
            )}
          >
            <FileIcon name={document.title} className="size-3.5 shrink-0" />
            <span className="text-[8px] opacity-70 leading-none">▼</span>
          </button>

          {/* Close Split Button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close Split View"
            aria-label="Close Split View"
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-all active:scale-95"
          >
            <X className="size-3" />
          </button>

          {/* Quick File Switcher Dropdown List */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[230px] max-h-[280px] overflow-y-auto rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs animate-in fade-in-0 zoom-in-95 duration-120">
              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider font-mono">
                Open Files ({documents.length})
              </div>
              {documents.map((doc) => {
                const isCurrent = doc.id === document.id;
                const docParts = doc.path.replace(/\\/g, "/").split("/").filter(Boolean);
                const parentDir = docParts.length > 1 ? docParts[docParts.length - 2] : "";

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      handleSelectDoc(doc.id);
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors group",
                      isCurrent
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-muted/60 text-foreground"
                    )}
                  >
                    <FileIcon name={doc.title} className="size-3.5 shrink-0" />
                    <span className="truncate flex-1 text-xs">{doc.title}</span>
                    {parentDir && (
                      <span className="text-[10px] text-muted-foreground/60 truncate max-w-[70px]">
                        {parentDir}
                      </span>
                    )}
                    {doc.isDirty && (
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    {isCurrent && (
                      <span className="text-[10px] text-primary shrink-0 font-bold">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex flex-1 flex-col h-full w-full overflow-hidden relative">
        {document.isBinary || document.isTooLarge ? (
          <BinaryFileView document={document} />
        ) : (
          <MonacoEditorView
            document={document}
            onCursorChange={onCursorChange}
          />
        )}
      </div>
    </div>
  );
}
