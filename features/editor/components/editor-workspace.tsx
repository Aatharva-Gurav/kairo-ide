"use client";

import React, { useState, useRef } from "react";
import { useEditor } from "../store";
import dynamic from "next/dynamic";
import { EditorTabs } from "./editor-tabs";
import { EditorBreadcrumb } from "./editor-breadcrumb";
import { EditorStatusBar } from "./editor-status-bar";
import { EditorEmptyState } from "./editor-empty-state";
import { BinaryFileView } from "./binary-file-view";
import { CloseConfirmModal } from "./close-confirm-modal";
import { GoToLineModal } from "./go-to-line-modal";

// Early client-side environment stub to prevent any loader or worker ErrorEvent
if (typeof window !== "undefined") {
  const globalObj = window as unknown as {
    MonacoEnvironment?: {
      getWorker: (moduleId: unknown, label: string) => Worker;
    };
  };
  if (!globalObj.MonacoEnvironment) {
    globalObj.MonacoEnvironment = {
      getWorker: function () {
        const workerBlob = new Blob(
          [`self.onmessage = function () {};`],
          { type: "application/javascript" }
        );
        return new Worker(URL.createObjectURL(workerBlob));
      },
    };
  }
}

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

import { SplitEditorPane } from "./split-editor-pane";
import { cn } from "@/lib/utils";

export function EditorWorkspace() {
  const { activeDocument, isSplit, splitDocument, splitRatio, setSplitRatio } = useEditor();
  const [cursorPos, setCursorPos] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1,
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(Math.max(newRatio, 0.2), 0.8));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setSplitRatio]);

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background">
      {/* Editor Tabs */}
      <EditorTabs />

      {/* Main Document Content or Empty State */}
      {activeDocument ? (
        isSplit && splitDocument ? (
          <div
            ref={containerRef}
            className={cn(
              "flex flex-1 h-full w-full overflow-hidden relative",
              isDragging && "select-none cursor-col-resize"
            )}
          >
            {/* Primary Left Pane */}
            <div
              style={{ width: `${splitRatio * 100}%` }}
              className="flex flex-col h-full overflow-hidden relative min-w-[150px]"
            >
              <EditorBreadcrumb document={activeDocument} />
              {activeDocument.isBinary || activeDocument.isTooLarge ? (
                <BinaryFileView document={activeDocument} />
              ) : activeDocument.error ? (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 max-w-md text-destructive">
                    <h3 className="font-semibold text-xs">Error opening file</h3>
                    <p className="text-xs mt-1 text-muted-foreground">{activeDocument.error}</p>
                  </div>
                </div>
              ) : (
                <MonacoEditorView
                  document={activeDocument}
                  onCursorChange={setCursorPos}
                />
              )}
              <EditorStatusBar document={activeDocument} cursorPosition={cursorPos} />
            </div>

            {/* Draggable Divider */}
            <div
              onMouseDown={handleMouseDown}
              className={cn(
                "w-1 h-full cursor-col-resize hover:bg-sidebar-primary/60 transition-colors z-20 shrink-0 bg-border/80 flex items-center justify-center group",
                "w-1.5 h-full cursor-col-resize hover:bg-sidebar-primary/50 transition-colors z-20 shrink-0 bg-border/70 flex items-center justify-center group",
                isDragging && "bg-sidebar-primary ring-1 ring-sidebar-primary"
              )}
              title="Drag to resize split view"
            >
              <div className="w-0.5 h-6 rounded-full bg-muted-foreground/40 group-hover:bg-sidebar-primary" />
              <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-sidebar-primary transition-colors" />
            </div>

            {/* Secondary Right Split Pane */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-[150px]">
              <SplitEditorPane document={splitDocument} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col h-full w-full overflow-hidden relative">
            <EditorBreadcrumb document={activeDocument} />

            {activeDocument.isBinary || activeDocument.isTooLarge ? (
              <BinaryFileView document={activeDocument} />
            ) : activeDocument.error ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 max-w-md text-destructive">
                  <h3 className="font-semibold text-xs">Error opening file</h3>
                  <p className="text-xs mt-1 text-muted-foreground">{activeDocument.error}</p>
                </div>
              </div>
            ) : (
              <MonacoEditorView
                document={activeDocument}
                onCursorChange={setCursorPos}
              />
            )}

            <EditorStatusBar document={activeDocument} cursorPosition={cursorPos} />
          </div>
        )
      ) : (
        <EditorEmptyState />
      )}

      {/* Global Modals */}
      <CloseConfirmModal />
      <GoToLineModal />
    </div>
  );
}
