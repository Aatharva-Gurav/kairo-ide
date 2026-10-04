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
  const {
    activeDocument,
    documents,
    isSplit,
    splitDirection,
    splitLayoutMode,
    splitDocument,
    thirdDocument,
    splitRatio,
    splitRatio2,
    setSplitRatio,
    setSplitRatio2,
    setThirdDocumentId,
    openSplitRight,
  } = useEditor();

  const [cursorMap, setCursorMap] = useState<
    Record<
      string,
      { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    >
  >({});
  const [draggingDivider, setDraggingDivider] = useState<null | 1 | 2>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCursorChange = React.useCallback(
    (
      docPath: string,
      pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    ) => {
      setCursorMap((prev) => ({
        ...prev,
        [docPath]: pos,
      }));
    },
    []
  );

  const activeCursorPos = activeDocument
    ? cursorMap[activeDocument.path] || {
        lineNumber: 1,
        column: 1,
        totalLines: activeDocument.content
          ? activeDocument.content.split(/\r\n|\r|\n/).length
          : 1,
      }
    : undefined;

  const isDragging = draggingDivider !== null;

  React.useEffect(() => {
    if (!draggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (splitDirection === "vertical") {
        const newRatio = (e.clientY - rect.top) / rect.height;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      } else if (splitLayoutMode === "split-three") {
        if (draggingDivider === 1) {
          const newRatio = (e.clientX - rect.left) / rect.width;
          setSplitRatio(Math.min(Math.max(newRatio, 0.15), splitRatio2 - 0.1));
        } else if (draggingDivider === 2) {
          const newRatio = (e.clientX - rect.left) / rect.width;
          setSplitRatio2(Math.min(Math.max(newRatio, splitRatio + 0.1), 0.85));
        }
      } else {
        const newRatio = (e.clientX - rect.left) / rect.width;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      }
    };

    const handleMouseUp = () => {
      setDraggingDivider(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingDivider, splitDirection, splitLayoutMode, splitRatio, splitRatio2, setSplitRatio, setSplitRatio2]);

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background">
      {/* Editor Tabs (Hidden when no file is open) */}
      {documents.length > 0 && <EditorTabs />}

      {/* Main Document Content or Empty State */}
      {activeDocument ? (
        isSplit && splitDocument ? (
          splitLayoutMode === "split-three" ? (
            /* 3-Column Split View */
            <div
              ref={containerRef}
              className={cn(
                "flex flex-1 flex-row h-full w-full overflow-hidden relative",
                isDragging && "select-none cursor-col-resize"
              )}
            >
              {/* Primary Pane 1 */}
              <div
                style={{ width: `${splitRatio * 100}%` }}
                className="flex flex-col h-full overflow-hidden relative min-w-[120px]"
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
                <EditorStatusBar document={activeDocument} cursorPosition={activeCursorPos} />
              </div>

              {/* Draggable Divider 1 */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDraggingDivider(1);
                }}
                className={cn(
                  "w-1.5 h-full cursor-col-resize hover:bg-sidebar-primary/50 transition-colors z-20 shrink-0 bg-border/70 flex items-center justify-center group",
                  draggingDivider === 1 && "bg-sidebar-primary ring-1 ring-sidebar-primary"
                )}
                title="Drag to resize pane 1"
              >
                <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-sidebar-primary transition-colors" />
              </div>

              {/* Secondary Pane 2 */}
              <div
                style={{ width: `${(splitRatio2 - splitRatio) * 100}%` }}
                className="flex flex-col h-full overflow-hidden relative min-w-[120px]"
              >
                <SplitEditorPane document={splitDocument} />
              </div>

              {/* Draggable Divider 2 */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDraggingDivider(2);
                }}
                className={cn(
                  "w-1.5 h-full cursor-col-resize hover:bg-sidebar-primary/50 transition-colors z-20 shrink-0 bg-border/70 flex items-center justify-center group",
                  draggingDivider === 2 && "bg-sidebar-primary ring-1 ring-sidebar-primary"
                )}
                title="Drag to resize pane 2 & 3"
              >
                <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-sidebar-primary transition-colors" />
              </div>

              {/* Third Pane 3 */}
              <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-[120px]">
                <SplitEditorPane
                  document={thirdDocument || splitDocument}
                  onClose={() => openSplitRight()}
                  onSelectDocument={setThirdDocumentId}
                />
              </div>
            </div>
          ) : (
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
                <EditorStatusBar document={activeDocument} cursorPosition={activeCursorPos} />
              </div>

              {/* Draggable Divider */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDraggingDivider(1);
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
                />
              </div>
            </div>
          )
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

            <EditorStatusBar document={activeDocument} cursorPosition={activeCursorPos} />
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
