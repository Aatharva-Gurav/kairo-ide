"use client";

import React from "react";
import dynamic from "next/dynamic";
import { EditorDocument } from "../types";
import { EditorPaneId } from "../store";
import { resolveEditorType } from "../services/editor-resolver";
import { BinaryFileView } from "./binary-file-view";

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

const MarkdownEditorView = dynamic(
  () =>
    import("@/features/markdown/components/markdown-editor-view").then(
      (mod) => mod.MarkdownEditorView
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center h-full w-full bg-background text-xs text-muted-foreground font-mono">
        Loading markdown editor...
      </div>
    ),
  }
);

interface DocumentEditorSurfaceProps {
  document: EditorDocument;
  paneId: EditorPaneId;
  onCursorChange?: (
    docPath: string,
    pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
  ) => void;
}

/**
 * Shared editor router for both primary and split panes.
 * Uses the centralized resolveEditorType resolver so all file-opening paths
 * consistently render Markdown, Binary/Media, or Monaco surfaces.
 */
export function DocumentEditorSurface({
  document,
  paneId,
  onCursorChange,
}: DocumentEditorSurfaceProps) {
  const editorKind =
    document.editorKind ??
    resolveEditorType(document.path, {
      isBinary: document.isBinary,
      isTooLarge: document.isTooLarge,
    });

  if (
    editorKind === "binary" ||
    editorKind === "image" ||
    editorKind === "audio" ||
    editorKind === "video" ||
    document.isBinary ||
    document.isTooLarge
  ) {
    return <BinaryFileView document={document} />;
  }

  if (document.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 max-w-md text-destructive">
          <h3 className="font-semibold text-xs">Error opening file</h3>
          <p className="text-xs mt-1 text-muted-foreground">{document.error}</p>
        </div>
      </div>
    );
  }

  if (editorKind === "markdown") {
    return (
      <MarkdownEditorView
        key={document.id}
        document={document}
        paneId={paneId}
        onCursorChange={onCursorChange}
      />
    );
  }

  return (
    <MonacoEditorView
      document={document}
      paneId={paneId}
      onCursorChange={onCursorChange}
    />
  );
}
