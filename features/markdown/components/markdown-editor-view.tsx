"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { EditorDocument } from "@/features/editor/types";
import { EditorPaneId, useEditor } from "@/features/editor/store";
import {
  MarkdownToolbar,
  MarkdownFormatAction,
  MarkdownViewMode,
} from "./markdown-toolbar";
import { MarkdownPreview } from "./markdown-preview";
import { countMarkdownStats } from "../services/markdown-parser";
import { cn } from "@/lib/utils";

const MonacoEditorView = dynamic(
  () =>
    import("@/features/editor/components/monaco-editor-view").then(
      (mod) => mod.MonacoEditorView
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

interface MarkdownEditorViewProps {
  document: EditorDocument;
  paneId?: EditorPaneId;
  onCursorChange?: (
    docPath: string,
    pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
  ) => void;
}

// Per-tab view mode memory so switching tabs preserves Edit / Preview / Split state (bounded LRU)
const MAX_VIEW_MODE_CACHE = 100;
const viewModeByDocId = new Map<string, MarkdownViewMode>();

export function MarkdownEditorView({
  document,
  paneId = "primary",
  onCursorChange,
}: MarkdownEditorViewProps) {
  const { monacoEditorRef } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);

  const [viewMode, setViewModeState] = useState<MarkdownViewMode>(() => {
    return viewModeByDocId.get(document.id) ?? "split";
  });
  const [isNarrow, setIsNarrow] = useState(false);
  const [debouncedContent, setDebouncedContent] = useState(document.content);

  const setViewMode = useCallback(
    (mode: MarkdownViewMode) => {
      if (viewModeByDocId.size >= MAX_VIEW_MODE_CACHE && !viewModeByDocId.has(document.id)) {
        const oldest = viewModeByDocId.keys().next().value;
        if (oldest !== undefined) viewModeByDocId.delete(oldest);
      }
      viewModeByDocId.set(document.id, mode);
      setViewModeState(mode);
    },
    [document.id]
  );

  // Debounce preview re-parsing for smooth typing on large docs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(document.content);
    }, 150);
    return () => clearTimeout(timer);
  }, [document.content]);

  // Adapt split orientation when container narrows below 720px
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 1000;
      setIsNarrow(width < 720);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stats = useMemo(() => countMarkdownStats(document.content), [document.content]);

  // Apply Markdown formatting directly via Monaco's edit API to preserve undo/redo & BufferSync
  const applyMarkdownFormat = useCallback(
    (action: MarkdownFormatAction) => {
      if (document.readonly || viewMode === "preview") return;
      const editor = monacoEditorRef.current;
      if (!editor) return;

      const model = editor.getModel?.();
      const selection = editor.getSelection?.();
      if (!model || !selection) return;

      const selectedText = model.getValueInRange(selection);

      const wrap = (prefix: string, suffix: string, placeholder: string) => {
        const inner = selectedText || placeholder;
        const replacement = `${prefix}${inner}${suffix}`;
        editor.executeEdits("markdown-toolbar", [
          { range: selection, text: replacement, forceMoveMarkers: true },
        ]);
        editor.focus();
      };

      const prefixLine = (prefix: string, placeholder: string) => {
        const text = selectedText || placeholder;
        const lines = text.split("\n").map((l: string) => `${prefix}${l}`);
        editor.executeEdits("markdown-toolbar", [
          { range: selection, text: lines.join("\n"), forceMoveMarkers: true },
        ]);
        editor.focus();
      };

      switch (action) {
        case "heading":
          prefixLine("## ", "Heading");
          break;
        case "bold":
          wrap("**", "**", "bold text");
          break;
        case "italic":
          wrap("*", "*", "italic text");
          break;
        case "strike":
          wrap("~~", "~~", "strikethrough");
          break;
        case "inlineCode":
          wrap("`", "`", "code");
          break;
        case "codeBlock":
          wrap("\n```ts\n", "\n```\n", "// code");
          break;
        case "link":
          wrap("[", "](https://)", "link text");
          break;
        case "image":
          wrap("![", "](path/to/image.png)", "alt text");
          break;
        case "quote":
          prefixLine("> ", "Quote");
          break;
        case "ul":
          prefixLine("- ", "List item");
          break;
        case "ol": {
          const text = selectedText || "List item";
          const lines = text.split("\n").map((l: string, idx: number) => `${idx + 1}. ${l}`);
          editor.executeEdits("markdown-toolbar", [
            { range: selection, text: lines.join("\n"), forceMoveMarkers: true },
          ]);
          editor.focus();
          break;
        }
        case "task":
          prefixLine("- [ ] ", "Task item");
          break;
        case "table": {
          const tableTpl =
            "\n| Column 1 | Column 2 |\n| :--- | :--- |\n| Cell 1 | Cell 2 |\n";
          editor.executeEdits("markdown-toolbar", [
            { range: selection, text: tableTpl, forceMoveMarkers: true },
          ]);
          editor.focus();
          break;
        }
      }
    },
    [document.readonly, viewMode, monacoEditorRef]
  );

  // Proportional scroll sync from Monaco editor to Preview in split mode.
  // Polls briefly until dynamic MonacoEditorView finishes mounting and populates monacoEditorRef.
  useEffect(() => {
    if (viewMode !== "split") return;
    let disposable: { dispose?: () => void } | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const attachScrollSync = () => {
      if (cancelled) return;
      const editor = monacoEditorRef.current;
      if (!editor || typeof editor.onDidScrollChange !== "function") {
        retryTimer = setTimeout(attachScrollSync, 100);
        return;
      }

      disposable = editor.onDidScrollChange(() => {
        if (isSyncingScrollRef.current) return;
        const previewEl = previewScrollRef.current;
        if (!previewEl) return;

        const scrollTop = editor.getScrollTop?.() ?? 0;
        const scrollHeight = editor.getScrollHeight?.() ?? 1;
        const layoutInfo = editor.getLayoutInfo?.();
        const viewportHeight = layoutInfo?.height ?? 1;
        const maxEditorScroll = Math.max(1, scrollHeight - viewportHeight);
        const ratio = scrollTop / maxEditorScroll;

        const maxPreviewScroll = Math.max(
          0,
          previewEl.scrollHeight - previewEl.clientHeight
        );
        isSyncingScrollRef.current = true;
        previewEl.scrollTop = ratio * maxPreviewScroll;
        requestAnimationFrame(() => {
          isSyncingScrollRef.current = false;
        });
      });
    };

    attachScrollSync();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      disposable?.dispose?.();
    };
  }, [viewMode, monacoEditorRef, document.id]);

  // Contextual Markdown shortcuts scoped to focused Markdown editor
  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && e.shiftKey && key === "v") {
        e.preventDefault();
        e.stopPropagation();
        setViewMode(viewMode === "preview" ? "edit" : "preview");
        return;
      }

      if (e.key === "Escape" && viewMode === "preview") {
        e.preventDefault();
        setViewMode("edit");
        return;
      }

      if (viewMode === "preview") return;

      if (mod && !e.shiftKey && !e.altKey) {
        if (key === "b") {
          e.preventDefault();
          e.stopPropagation();
          applyMarkdownFormat("bold");
        } else if (key === "i") {
          e.preventDefault();
          e.stopPropagation();
          applyMarkdownFormat("italic");
        } else if (key === "k") {
          e.preventDefault();
          e.stopPropagation();
          applyMarkdownFormat("link");
        }
      }
    },
    [viewMode, setViewMode, applyMarkdownFormat]
  );

  return (
    <div
      ref={containerRef}
      onKeyDownCapture={handleKeyDownCapture}
      className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background"
    >
      <MarkdownToolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onFormat={applyMarkdownFormat}
        words={stats.words}
        characters={stats.characters}
        readonly={document.readonly}
      />

      <div
        className={cn(
          "flex flex-1 min-h-0 w-full overflow-hidden",
          viewMode === "split" && isNarrow ? "flex-col" : "flex-row"
        )}
      >
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            className={cn(
              "flex flex-col min-w-0 min-h-0 overflow-hidden",
              viewMode === "split"
                ? isNarrow
                  ? "h-1/2 w-full border-b border-border/70"
                  : "w-1/2 h-full border-r border-border/70"
                : "flex-1 h-full w-full"
            )}
          >
            <MonacoEditorView
              document={document}
              paneId={paneId}
              onCursorChange={onCursorChange}
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={cn(
              "flex flex-col min-w-0 min-h-0 overflow-hidden",
              viewMode === "split"
                ? isNarrow
                  ? "h-1/2 w-full"
                  : "w-1/2 h-full"
                : "flex-1 h-full w-full"
            )}
          >
            <MarkdownPreview
              content={debouncedContent}
              documentPath={document.path}
              previewRef={previewScrollRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
