"use client";

import React, { useState } from "react";
import { useEditor } from "../store";
import { EditorDocument } from "../types";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { FileIcon } from "@/features/file-explorer/components/file-icon";
import { EditorStatusBar } from "./editor-status-bar";
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
}

export function SplitEditorPane({ document }: SplitEditorPaneProps) {
  const { documents, closeSplitView, setSplitDocumentId } = useEditor();
  const [cursorPos, setCursorPos] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1,
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const parts = document.path.split("/").filter(Boolean);

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden relative border-l border-border/70 bg-background">
      {/* Split Pane Header */}
      <div className="flex h-9 w-full items-center justify-between border-b border-border/70 bg-sidebar/50 dark:bg-sidebar/40 px-2 select-none">
        {/* Document Selector & Breadcrumb */}
        <div className="relative flex items-center gap-2 overflow-hidden">
          <div
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-sidebar-accent/70 text-xs font-medium text-foreground cursor-pointer transition-colors border border-transparent hover:border-sidebar-border/60"
            title="Switch Split File"
          >
            <FileIcon name={document.title} className="size-3.5 shrink-0" />
            <span className="truncate max-w-[140px]">{document.title}</span>
            <span className="text-[10px] text-muted-foreground font-mono">▼</span>
          </div>

          {/* Quick file switcher dropdown */}
          {isDropdownOpen && (
            <div className="absolute top-8 left-0 z-50 min-w-[210px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs animate-in fade-in-0 zoom-in-95 duration-120 delay-subtle">
              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider font-mono">
                Open in Split View
              </div>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => {
                    setSplitDocumentId(doc.id);
                    setIsDropdownOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
                    doc.id === document.id
                      ? "bg-sidebar-primary/20 text-sidebar-primary font-medium"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <FileIcon name={doc.title} className="size-3.5 shrink-0" />
                  <span className="truncate flex-1">{doc.title}</span>
                  {doc.isDirty && (
                    <span className="size-1.5 rounded-full bg-sidebar-primary" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mini breadcrumb */}
          <div className="hidden sm:flex items-center text-[11px] text-muted-foreground gap-1">
            <span className="opacity-40">|</span>
            {parts.slice(-2, -1).map((part, idx) => (
              <React.Fragment key={idx}>
                <span className="truncate max-w-[100px]">{part}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5 opacity-60" />
              </React.Fragment>
            ))}
            <span className="text-foreground/80 font-medium truncate max-w-[120px]">
              {document.title}
            </span>
          </div>
        </div>

        {/* Close Split Button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={closeSplitView}
            title="Close Split View (Ctrl+\)"
            className="flex items-center justify-center size-6 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-all active:scale-90"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex flex-1 flex-col h-full w-full overflow-hidden relative">
        {document.isBinary || document.isTooLarge ? (
          <BinaryFileView document={document} />
        ) : (
          <MonacoEditorView
            document={document}
            onCursorChange={setCursorPos}
          />
        )}

        <EditorStatusBar document={document} cursorPosition={cursorPos} />
      </div>
    </div>
  );
}
