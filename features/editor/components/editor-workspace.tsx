"use client";

import React, { useState } from "react";
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

export function EditorWorkspace() {
  const { activeDocument } = useEditor();
  const [cursorPos, setCursorPos] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1,
  });

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background">
      {/* Editor Tabs */}
      <EditorTabs />

      {/* Main Document Content or Empty State */}
      {activeDocument ? (
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
      ) : (
        <EditorEmptyState />
      )}

      {/* Global Modals */}
      <CloseConfirmModal />
      <GoToLineModal />
    </div>
  );
}
