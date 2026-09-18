"use client";

import React from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { LanguageService } from "../services/language.service";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon } from "@hugeicons/core-free-icons";

interface EditorStatusBarProps {
  document: EditorDocument | null;
  cursorPosition?: { lineNumber: number; column: number };
}

export function EditorStatusBar({ document, cursorPosition }: EditorStatusBarProps) {
  const { settings, formatActiveDocument } = useEditor();

  if (!document) return null;

  const displayName = LanguageService.getDisplayName(document.language);

  return (
    <div className="flex h-6 w-full items-center justify-between border-t border-border bg-sidebar px-3 text-[11px] text-muted-foreground select-none">
      {/* Left side: line and column */}
      <div className="flex items-center gap-4">
        {cursorPosition && (
          <span>
            Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
          </span>
        )}
        <span>Spaces: {settings.tabSize}</span>
        <span>UTF-8</span>
      </div>

      {/* Right side: language and format document */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => formatActiveDocument()}
          title="Format Document (Shift+Alt+F)"
          className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors px-1 rounded hover:bg-muted"
        >
          <HugeiconsIcon icon={CodeIcon} className="size-3" />
          <span>Format</span>
        </button>

        <span className="font-medium text-foreground/80">{displayName}</span>
      </div>
    </div>
  );
}

