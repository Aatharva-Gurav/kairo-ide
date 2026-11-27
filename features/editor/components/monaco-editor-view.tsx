"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEditor, EditorPaneId } from "../store";
import { useSettings } from "@/features/settings/store";
import { ModelService } from "../services/model.service";
import { IntelliSenseService } from "../services/intellisense.service";
import { EditorDocument } from "../types";
import { ideEvents } from "@/lib/events";
import { installMonacoWorkerStub } from "@/lib/monaco-worker-stub";
import { THEME_DEFINITIONS, migrateLegacyTheme } from "@/features/theme";
import { EditorFindReplace } from "./editor-find-replace";

// Ensure Monaco runs completely offline from the bundled npm module.
// Registers the shared protocol-compliant worker stub (see lib/monaco-worker-stub.ts)
// which answers every editor-worker and language-service request with valid
// empty-result shapes, preventing unhandled rejections in Monaco internals.
if (typeof window !== "undefined") {
  installMonacoWorkerStub();

  // Set window.monaco so @monaco-editor/loader can directly detect the local instance
  (window as unknown as { monaco?: unknown }).monaco = monaco;

  // Configure loader to use the bundled monaco instance directly
  loader.config({ monaco });

  // 4. Register custom IDE themes matching all 14 VS Code-inspired themes
  try {
    for (const [id, def] of Object.entries(THEME_DEFINITIONS)) {
      monaco.editor.defineTheme(id, {
        base: def.monaco.base,
        inherit: true,
        rules: def.monaco.rules,
        colors: def.monaco.colors,
      });
    }

    // Register legacy aliases for backward compatibility
    monaco.editor.defineTheme("kairo-dark", {
      base: THEME_DEFINITIONS["dark-modern"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["dark-modern"].monaco.rules,
      colors: THEME_DEFINITIONS["dark-modern"].monaco.colors,
    });
    monaco.editor.defineTheme("kairo-light", {
      base: THEME_DEFINITIONS["light-modern"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["light-modern"].monaco.rules,
      colors: THEME_DEFINITIONS["light-modern"].monaco.colors,
    });
    monaco.editor.defineTheme("dark", {
      base: THEME_DEFINITIONS["dark-modern"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["dark-modern"].monaco.rules,
      colors: THEME_DEFINITIONS["dark-modern"].monaco.colors,
    });
    monaco.editor.defineTheme("light", {
      base: THEME_DEFINITIONS["light-modern"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["light-modern"].monaco.rules,
      colors: THEME_DEFINITIONS["light-modern"].monaco.colors,
    });
    monaco.editor.defineTheme("one-dark-pro", {
      base: THEME_DEFINITIONS["graphite"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["graphite"].monaco.rules,
      colors: THEME_DEFINITIONS["graphite"].monaco.colors,
    });
    monaco.editor.defineTheme("dracula", {
      base: THEME_DEFINITIONS["midnight-blue"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["midnight-blue"].monaco.rules,
      colors: THEME_DEFINITIONS["midnight-blue"].monaco.colors,
    });
    monaco.editor.defineTheme("tokyo-night", {
      base: THEME_DEFINITIONS["midnight-blue"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["midnight-blue"].monaco.rules,
      colors: THEME_DEFINITIONS["midnight-blue"].monaco.colors,
    });
    monaco.editor.defineTheme("github-dark", {
      base: THEME_DEFINITIONS["dark-modern"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["dark-modern"].monaco.rules,
      colors: THEME_DEFINITIONS["dark-modern"].monaco.colors,
    });
    monaco.editor.defineTheme("monokai", {
      base: THEME_DEFINITIONS["forest-dark"].monaco.base,
      inherit: true,
      rules: THEME_DEFINITIONS["forest-dark"].monaco.rules,
      colors: THEME_DEFINITIONS["forest-dark"].monaco.colors,
    });
  } catch {
    // Themes already registered
  }

  // 5. Initialize Monaco language defaults and disable internal worker adapters
  IntelliSenseService.init(monaco);
}

interface MonacoEditorViewProps {
  document: EditorDocument;
  paneId?: EditorPaneId;
  onCursorChange?: (docPath: string, pos: {
    lineNumber: number;
    column: number;
    selectionCount?: number;
    totalLines?: number;
  }) => void;
}

export function MonacoEditorView({ document, paneId = "primary", onCursorChange }: MonacoEditorViewProps) {
  const {
    settings,
    updateContent,
    focusedPane,
    registerPaneEditor,
    focusPane,
    isSplit,
  } = useEditor();
  const minimapEnabled = !isSplit && (settings.minimap ?? true);
  const { settings: ideSettings } = useSettings();
  const suggestions = ideSettings.suggestions;
  const [currentTheme, setCurrentTheme] = useState("dark-modern");
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localEditorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentListenerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorInstance, setEditorInstance] = useState<any>(null);

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceMode, setIsReplaceMode] = useState(false);

  const focusedPaneRef = useRef(focusedPane);
  useEffect(() => {
    focusedPaneRef.current = focusedPane;
  }, [focusedPane]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const paneIdRef = useRef(paneId);
  useEffect(() => {
    paneIdRef.current = paneId;
  }, [paneId]);

  // Listen to menubar or global find and replace triggers, scoped to focused pane
  useEffect(() => {
    const unsubs = [
      ideEvents.on("editor:find", (payload) => {
        if (payload?.paneId && payload.paneId !== paneIdRef.current) return;
        if (!payload?.paneId && focusedPaneRef.current !== paneIdRef.current) return;
        if (!payload || !payload.path || payload.path === document.path) {
          setIsFindOpen(true);
          setIsReplaceMode(false);
        }
      }),
      ideEvents.on("editor:replace", (payload) => {
        if (payload?.paneId && payload.paneId !== paneIdRef.current) return;
        if (!payload?.paneId && focusedPaneRef.current !== paneIdRef.current) return;
        if (!payload || !payload.path || payload.path === document.path) {
          setIsFindOpen(true);
          setIsReplaceMode(true);
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [document.path]);

  // Release pane editor registration safely on unmount
  useEffect(() => {
    return () => {
      registerPaneEditor(paneIdRef.current, null);
    };
  }, [registerPaneEditor]);

  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  });

  const documentRef = useRef(document);
  useEffect(() => {
    documentRef.current = document;
  });

  // Helper to accurately broadcast cursor line/column and selection details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emitCursorPosition = (ed: any) => {
    if (!ed || !onCursorChangeRef.current) return;
    try {
      const pos = ed.getPosition();
      const model = ed.getModel();
      const doc = documentRef.current;
      const totalLines = model
        ? model.getLineCount()
        : doc.content
          ? doc.content.split(/\r\n|\r|\n/).length
          : 1;

      let selectionCount: number | undefined;
      const sel = ed.getSelection();
      if (sel && !sel.isEmpty()) {
        const text = model?.getValueInRange(sel) || "";
        selectionCount = text.length;
      }

      if (pos) {
        onCursorChangeRef.current(doc.path, {
          lineNumber: pos.lineNumber,
          column: pos.column,
          selectionCount,
          totalLines,
        });
      }
    } catch {
      // safely handle any Monaco lifecycle edge cases
    }
  };

  // Sync theme with data-theme attribute and dark class on <html>
  useEffect(() => {
    const updateTheme = () => {
      if (typeof window === "undefined") return;
      const root = window.document.documentElement;
      const themeAttr = root.getAttribute("data-theme") || "dark-modern";
      const resolved = migrateLegacyTheme(themeAttr);
      const isDarkClass = root.classList.contains("dark");

      const finalTheme =
        resolved === "system"
          ? isDarkClass
            ? "dark-modern"
            : "light-modern"
          : resolved;

      setCurrentTheme(finalTheme);
      try {
        monaco.editor.setTheme(finalTheme);
      } catch {
        // Monaco editor instance may not yet be initialized
      }
    };

    updateTheme();

    const observer = new MutationObserver(() => {
      updateTheme();
    });

    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  // Listen to zoom events from status bar / external triggers
  useEffect(() => {
    const unsubs = [
      ideEvents.on("editor:zoom-in", () => {
        localEditorRef.current?.trigger("keyboard", "editor.action.fontZoomIn", null);
      }),
      ideEvents.on("editor:zoom-out", () => {
        localEditorRef.current?.trigger("keyboard", "editor.action.fontZoomOut", null);
      }),
      ideEvents.on("editor:zoom-reset", () => {
        localEditorRef.current?.trigger("keyboard", "editor.action.fontZoomReset", null);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const suggestionsEnabled = suggestions?.enabled ?? true;
  const monacoOptions = React.useMemo(
    () => ({
      contextmenu: false,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      fontWeight: settings.fontWeight || "normal",
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
      detectIndentation: false,
      wordWrap: settings.wordWrap,
      lineNumbers: settings.lineNumbers,
      minimap: { enabled: minimapEnabled },
      cursorStyle: settings.cursorStyle || "line",
      cursorBlinking: settings.cursorBlinking || "smooth",
      cursorSmoothCaretAnimation: "on" as const,
      renderLineHighlight: "all" as const,
      renderLineHighlightOnlyWhenFocus: false,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: "always" as const,
      renderWhitespace: settings.renderWhitespace,
      automaticLayout: true,
      smoothScrolling: settings.smoothScrolling ?? true,
      stickyScroll: { enabled: settings.stickyScroll ?? true },
      mouseWheelZoom: true,
      bracketPairColorization: { enabled: settings.bracketPairGuides ?? true },
      guides: {
        bracketPairs: settings.bracketPairGuides ?? true,
        indentation: true,
        bracketPairsHorizontal: true,
      },
      formatOnPaste: Boolean(settings.formatOnPaste),
      formatOnType: Boolean(settings.formatOnType),
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: false,
      padding: { top: 8, bottom: 8 },
      hover: {
        enabled: "off" as const,
      },
      inlayHints: {
        enabled: "off" as const,
      },
      suggestFontSize: suggestions?.fontSize ?? 12,
      suggestLineHeight: Math.round((suggestions?.fontSize ?? 12) * 2),
      quickSuggestions:
        suggestionsEnabled && (suggestions?.quickSuggestions ?? true)
          ? { other: true, comments: true, strings: true }
          : false,
      quickSuggestionsDelay: 10,
      suggestOnTriggerCharacters:
        suggestionsEnabled && (suggestions?.suggestOnTriggerCharacters ?? true),
      acceptSuggestionOnEnter: suggestionsEnabled
        ? (suggestions?.acceptSuggestionOnEnter ?? "on")
        : ("off" as const),
      tabCompletion: (suggestionsEnabled
        ? (suggestions?.tabCompletion ?? "on")
        : "off") as "on" | "off" | "onlySnippets",
      snippetSuggestions: (suggestionsEnabled
        ? (suggestions?.snippetSuggestions ?? "inline")
        : "none") as "top" | "inline" | "bottom" | "none",
      wordBasedSuggestions: suggestionsEnabled ? ("allDocuments" as const) : ("off" as const),
      inlineSuggest: {
        enabled: suggestionsEnabled && (suggestions?.preview ?? true),
      },
      suggest: {
        showIcons: suggestions?.showIcons ?? true,
        showStatusBar: true,
        preview: suggestionsEnabled && (suggestions?.preview ?? true),
        previewMode: "subwordSmart" as const,
        shareSuggestSelections: true,
        filterGraceful: true,
        localityBonus: true,
        snippetsPreventQuickSuggestions: false,
        showWords: suggestionsEnabled,
        showSnippets: suggestionsEnabled && suggestions?.snippetSuggestions !== "none",
        showKeywords: suggestionsEnabled,
        showFunctions: suggestionsEnabled,
        showClasses: suggestionsEnabled,
        showVariables: suggestionsEnabled,
        showConstants: suggestionsEnabled,
        showFields: suggestionsEnabled,
        showProperties: suggestionsEnabled,
        showEvents: suggestionsEnabled,
        showOperators: suggestionsEnabled,
        showUnits: suggestionsEnabled,
        showValues: suggestionsEnabled,
        showEnumMembers: suggestionsEnabled,
        showColors: suggestionsEnabled,
        showFiles: suggestionsEnabled,
        showReferences: suggestionsEnabled,
        showFolders: suggestionsEnabled,
        showTypeParameters: suggestionsEnabled,
        showModules: suggestionsEnabled,
        showStructs: suggestionsEnabled,
        showInterfaces: suggestionsEnabled,
      },
    }),
    [settings, suggestions, suggestionsEnabled, minimapEnabled]
  );

  // Live-update Monaco editor and active model options whenever settings change
  useEffect(() => {
    const ed = localEditorRef.current;
    if (!ed) return;
    ed.updateOptions(monacoOptions);
    const model = ed.getModel();
    if (model && !model.isDisposed?.()) {
      model.updateOptions({
        tabSize: settings.tabSize,
        insertSpaces: settings.insertSpaces,
      });
    }
  }, [monacoOptions, settings.tabSize, settings.insertSpaces, editorInstance]);

  // Hardware-accelerated layout observer for instant, zero-glitch window & pane resizing
  useEffect(() => {
    const container = containerRef.current;
    const editor = localEditorRef.current;
    if (!container || !editor) return;

    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          editor.layout();
        } catch {
          // Guard against unmounted/disposed editor
        }
      });
    });

    ro.observe(container);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [editorInstance]);

  // Update attached model when document path or active document changes
  useEffect(() => {
    const editor = localEditorRef.current;
    if (!editor) return;

    const model = ModelService.createOrReuseModel(
      monaco,
      document.path,
      documentRef.current.content,
      document.language
    );

    if (model) {
      model.updateOptions({
        tabSize: settingsRef.current.tabSize,
        insertSpaces: settingsRef.current.insertSpaces,
      });
      if (editor.getModel() !== model) {
        ModelService.saveViewState(editor, document.path);
        editor.setModel(model);
        ModelService.restoreViewState(editor, document.path);
      }
      emitCursorPosition(editor);
    }

    // Subscribe to content changes
    if (contentListenerRef.current) {
      contentListenerRef.current.dispose();
    }

    if (model) {
      contentListenerRef.current = model.onDidChangeContent(() => {
        const val = model.getValue();
        updateContent(document.path, val);
      });
    }

    return () => {
      if (contentListenerRef.current) {
        contentListenerRef.current.dispose();
      }
      ModelService.saveViewState(editor, document.path);
    };
    // Re-bind when document identity, language, or editor instance changes, not on content keystrokes
  }, [document.path, document.language, updateContent, editorInstance]);

  // Synchronize external content changes (e.g. workspace replace in files) lively
  useEffect(() => {
    const editor = localEditorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== document.content && !document.isDirty) {
      const pos = editor.getPosition();
      model.setValue(document.content);
      if (pos) {
        editor.setPosition(pos);
      }
    }
  }, [document.content, document.isDirty]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorDidMount = (editor: any) => {
    localEditorRef.current = editor;
    setEditorInstance(editor);
    registerPaneEditor(paneIdRef.current, editor);
    focusPane(paneIdRef.current, documentRef.current.path);

    // Initialize IntelliSense and snippets
    IntelliSenseService.init(monaco);

    // Initial model attachment
    const model = ModelService.createOrReuseModel(
      monaco,
      document.path,
      document.content,
      document.language
    );
    if (model) {
      model.updateOptions({
        tabSize: settingsRef.current.tabSize,
        insertSpaces: settingsRef.current.insertSpaces,
      });
      editor.setModel(model);
      ModelService.restoreViewState(editor, document.path);

      // Bind content changes immediately on mount
      if (contentListenerRef.current) {
        contentListenerRef.current.dispose();
      }
      contentListenerRef.current = model.onDidChangeContent(() => {
        const val = model.getValue();
        updateContent(documentRef.current.path, val);
      });
    }

    // Cursor position listener for bottom status bar
    editor.onDidChangeCursorPosition(() => {
      emitCursorPosition(editor);
    });

    // Selection listener for bottom status bar selection count
    editor.onDidChangeCursorSelection(() => {
      emitCursorPosition(editor);
    });

    editor.onDidFocusEditorText(() => {
      focusPane(paneIdRef.current, documentRef.current.path);
      emitCursorPosition(editor);
    });

    editor.onDidFocusEditorWidget?.(() => {
      focusPane(paneIdRef.current, documentRef.current.path);
    });

    editor.onDidDispose?.(() => {
      if (localEditorRef.current === editor) {
        localEditorRef.current = null;
      }
      registerPaneEditor(paneIdRef.current, null);
    });

    editor.onMouseUp(() => {
      focusPane(paneIdRef.current, documentRef.current.path);
      emitCursorPosition(editor);
    });

    editor.onKeyUp(() => {
      emitCursorPosition(editor);
    });

    // Emit initial position immediately upon mount
    emitCursorPosition(editor);

    // Disable and cancel editor context menu
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.onContextMenu((e: any) => {
      e.event?.preventDefault?.();
      e.event?.stopPropagation?.();
    });

    editor.focus();
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="relative flex-1 w-full h-full overflow-hidden bg-background z-0 isolate"
    >
      <Editor
        height="100%"
        width="100%"
        theme={currentTheme}
        options={monacoOptions}
        onMount={handleEditorDidMount}
      />

      {/* Sleek Draggable Editor Find & Replace Component */}
      <EditorFindReplace
        editor={editorInstance}
        documentPath={document.path}
        isOpen={isFindOpen}
        isReplaceMode={isReplaceMode}
        onClose={() => setIsFindOpen(false)}
        onToggleReplaceMode={(mode) =>
          setIsReplaceMode((prev) => (mode !== undefined ? mode : !prev))
        }
        containerRef={containerRef}
      />
    </div>
  );
}
