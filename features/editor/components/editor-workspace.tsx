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
import { FloatingCreationFeature } from "./floating-creation";

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
  const {
    activeDocument,
    documents,
    isSplit,
    splitDirection,
    splitDocument,
    splitRatio,
    setSplitRatio,
  } = useEditor();

  const [cursorMap, setCursorMap] = useState<
    Record<
      string,
      { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    >
  >({});
  const [focusedDocPath, setFocusedDocPath] = useState<string | null>(null);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCursorChange = React.useCallback(
    (
      docPath: string,
      pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    ) => {
      setFocusedDocPath(docPath);
      setCursorMap((prev) => ({
        ...prev,
        [docPath]: pos,
      }));
    },
    []
  );

  const focusedDocument = React.useMemo(() => {
    if (isSplit && splitDocument && focusedDocPath === splitDocument.path) {
      return splitDocument;
    }
    return activeDocument;
  }, [isSplit, splitDocument, activeDocument, focusedDocPath]);

  const focusedCursorPos = focusedDocument
    ? cursorMap[focusedDocument.path] || {
        lineNumber: 1,
        column: 1,
        totalLines: focusedDocument.content
          ? focusedDocument.content.split(/\r\n|\r|\n/).length
          : 1,
      }
    : undefined;

  const isDragging = isDraggingDivider;

  React.useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (splitDirection === "vertical") {
        const newRatio = (e.clientY - rect.top) / rect.height;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      } else {
        const newRatio = (e.clientX - rect.left) / rect.width;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingDivider, splitDirection, setSplitRatio]);

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background relative">
      {/* Editor Tabs (Hidden when no file is open) */}
      {documents.length > 0 && <EditorTabs />}

      {/* Main Document Content or Empty State */}
      {activeDocument ? (
        isSplit && splitDocument ? (
          /* 2-Pane Split (Horizontal or Vertical) */
          <div
            ref={containerRef}
            className={cn(
              "flex flex-1 h-full w-full overflow-hidden relative",
              splitDirection === "vertical" ? "flex-col" : "flex-row",
              isDragging &&
                (splitDirection === "vertical"
                  ? "select-none cursor-row-resize"
                  : "select-none cursor-col-resize")
            )}
          >
            {/* Primary Pane (Left or Top) */}
            <div
              onMouseDown={() => {
                if (activeDocument) setFocusedDocPath(activeDocument.path);
              }}
              style={
                splitDirection === "vertical"
                  ? { height: `${splitRatio * 100}%` }
                  : { width: `${splitRatio * 100}%` }
              }
              className={cn(
                "flex flex-col overflow-hidden relative",
                splitDirection === "vertical"
                  ? "w-full min-h-[100px]"
                  : "h-full min-w-[150px]"
              )}
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
                  onCursorChange={handleCursorChange}
                />
              )}
            </div>

            {/* Draggable Divider */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingDivider(true);
              }}
              className={cn(
                "transition-colors z-20 shrink-0 bg-border/70 flex items-center justify-center group",
                splitDirection === "vertical"
                  ? "h-1.5 w-full cursor-row-resize hover:bg-sidebar-primary/50"
                  : "w-1.5 h-full cursor-col-resize hover:bg-sidebar-primary/50",
                isDragging && "bg-sidebar-primary ring-1 ring-sidebar-primary"
              )}
              title={
                splitDirection === "vertical"
                  ? "Drag to resize split rows"
                  : "Drag to resize split view"
              }
            >
              <div
                className={cn(
                  "rounded-full bg-muted-foreground/30 group-hover:bg-sidebar-primary transition-colors",
                  splitDirection === "vertical" ? "h-0.5 w-8" : "w-0.5 h-8"
                )}
              />
            </div>

            {/* Secondary Split Pane (Right or Bottom) */}
            <div
              onMouseDown={() => {
                if (splitDocument) setFocusedDocPath(splitDocument.path);
              }}
              className={cn(
                "flex-1 flex flex-col overflow-hidden relative",
                splitDirection === "vertical"
                  ? "w-full min-h-[100px]"
                  : "h-full min-w-[150px]"
              )}
            >
              <SplitEditorPane
                document={splitDocument}
                isVertical={splitDirection === "vertical"}
                onCursorChange={handleCursorChange}
              />
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
                onCursorChange={handleCursorChange}
              />
            )}
          </div>
        )
      ) : (
        <EditorEmptyState />
      )}

      {/* Unified Status Bar across the bottom of the editor workspace */}
      {focusedDocument && (
        <EditorStatusBar document={focusedDocument} cursorPosition={focusedCursorPos} />
      )}

      {/* Floating File & Folder Creation Feature */}
      <FloatingCreationFeature hasStatusBar={Boolean(focusedDocument)} />

      {/* Global Modals */}
      <CloseConfirmModal />
      <GoToLineModal />
    </div>
  );
}
