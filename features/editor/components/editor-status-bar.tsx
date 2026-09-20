"use client";

import React, { useState, useEffect } from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { LanguageService } from "../services/language.service";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon } from "@hugeicons/core-free-icons";
import { ideEvents } from "@/lib/events";

interface EditorStatusBarProps {
  document: EditorDocument | null;
  cursorPosition?: { lineNumber: number; column: number };
}

export function EditorStatusBar({ document, cursorPosition }: EditorStatusBarProps) {
  const { settings, formatActiveDocument, editorZoomLevel, zoomIn, zoomOut, zoomReset } = useEditor();
  const [saveIndicator, setSaveIndicator] = useState(false);

  useEffect(() => {
    const unsub = ideEvents.on("editor:document-saved", (payload) => {
      if (document && payload.path === document.path) {
        setSaveIndicator(true);
        const timer = setTimeout(() => {
          setSaveIndicator(false);
        }, 1600);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [document]);

  if (!document) return null;

  const displayName = LanguageService.getDisplayName(document.language);
  const zoomPct = Math.round(100 + editorZoomLevel * 10);

  return (
    <div className="flex h-6 w-full items-center justify-between border-t border-border/70 bg-sidebar/95 px-3 text-[11px] text-muted-foreground select-none font-mono">
      {/* Left side: line and column + Save indicator */}
      <div className="flex items-center gap-2">
        {cursorPosition && (
          <span className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/50">
            Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
          </span>
        )}
        <span className="text-border/60">•</span>
        <span className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/50">
          Spaces: {settings.tabSize}
        </span>
        <span className="text-border/60">•</span>
        <span className="hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-sidebar-accent/50">
          UTF-8
        </span>
        {saveIndicator && (
          <>
            <span className="text-border/60">•</span>
            <span className="text-emerald-500 dark:text-emerald-400 font-medium font-sans flex items-center gap-1 animate-kairo-pop bg-emerald-500/10 dark:bg-emerald-400/10 px-1.5 py-0.2 rounded border border-emerald-500/20 shadow-2xs">
              <span>Saved</span>
              <span className="text-xs font-bold">✓</span>
            </span>
          </>
        )}
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

        <span className="font-medium text-foreground/90 font-sans px-1.5 py-0.5 rounded hover:bg-sidebar-accent/50 cursor-pointer transition-colors">
          {displayName}
        </span>
      </div>
    </div>
  );
}
