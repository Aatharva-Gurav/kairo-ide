"use client";

import React from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { LanguageService } from "../services/language.service";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon } from "@hugeicons/core-free-icons";

interface EditorStatusBarProps {
  document: EditorDocument | null;
  cursorPosition?: {
    lineNumber: number;
    column: number;
    selectionCount?: number;
    totalLines?: number;
  };
}

export function EditorStatusBar({ document, cursorPosition }: EditorStatusBarProps) {
  const {
    settings,
    formatActiveDocument,
    editorZoomLevel,
    zoomIn,
    zoomOut,
    zoomReset,
    setGoToLineVisible,
  } = useEditor();

  if (!document) return null;

  const displayName = LanguageService.getDisplayName(document.language);
  const zoomPct = Math.round(100 + editorZoomLevel * 10);
  const line = cursorPosition?.lineNumber ?? 1;
  const col = cursorPosition?.column ?? 1;
  const totalLines = cursorPosition?.totalLines;
  const selectionCount = cursorPosition?.selectionCount;
  const lineEnding = document.content.includes("\r\n") ? "CRLF" : "LF";

  return (
    <div className="relative z-20 shrink-0 flex h-6 w-full items-center justify-between border-t border-border/70 bg-sidebar/95 px-3 text-[11px] text-muted-foreground select-none font-mono shadow-xs">
      {/* Left side: line and column, indent, encoding, line endings */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGoToLineVisible(true)}
          title={`Line ${line}, Column ${col}${totalLines ? ` (Total: ${totalLines} lines)` : ""} — Click to Go to Line (Ctrl+G)`}
          className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/60 flex items-center gap-1 font-mono text-[11px]"
        >
          <span>
            Ln {line}, Col {col}
          </span>
          {selectionCount && selectionCount > 0 ? (
            <span className="text-muted-foreground/80 font-normal">
              ({selectionCount} selected)
            </span>
          ) : null}
        </button>
        <span className="text-border/60">•</span>
        <span
          title="Indentation: Spaces"
          className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/60"
        >
          Spaces: {settings.tabSize}
        </span>
        <span className="text-border/60">•</span>
        <span
          title="File Encoding"
          className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/60"
        >
          UTF-8
        </span>
        <span className="text-border/60">•</span>
        <span
          title="End of Line Sequence"
          className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/60 font-mono"
        >
          {lineEnding}
        </span>
      </div>

      {/* Right side: zoom controls, format document, language */}
      <div className="flex items-center gap-2.5">
        {/* Editor Zoom Controls */}
        <div className="flex items-center gap-0.5 font-sans text-[10px] text-muted-foreground bg-sidebar-accent/40 px-1 py-0.5 rounded border border-sidebar-border/60">
          <button
            type="button"
            onClick={zoomOut}
            title="Editor Zoom Out (Ctrl+-)"
            className="size-3.5 flex items-center justify-center rounded hover:bg-sidebar-accent hover:text-foreground active:scale-90 transition-colors cursor-pointer font-bold leading-none"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomReset}
            title="Reset Editor Zoom to 100% (Ctrl+0)"
            className="px-1 hover:text-foreground cursor-pointer transition-colors font-mono"
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            title="Editor Zoom In (Ctrl+=)"
            className="size-3.5 flex items-center justify-center rounded hover:bg-sidebar-accent hover:text-foreground active:scale-90 transition-colors cursor-pointer font-bold leading-none"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => formatActiveDocument()}
          title="Format Document (Shift+Alt+F)"
          className="group flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95 px-1.5 py-0.5 rounded hover:bg-sidebar-accent/80 font-sans"
        >
          <HugeiconsIcon icon={CodeIcon} className="size-3 transition-transform duration-140 group-hover:scale-105" />
          <span>Format</span>
        </button>

        <span className="font-medium text-foreground/90 font-sans px-1.5 py-0.5 rounded hover:bg-sidebar-accent/60 cursor-pointer transition-colors">
          {displayName}
        </span>
      </div>
    </div>
  );
}
