"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEditor } from "../store";
import { useSettings } from "@/features/settings/store";
import { ModelService } from "../services/model.service";
import { IntelliSenseService } from "../services/intellisense.service";
import { NavigationService } from "../services/navigation.service";
import { EditorDocument } from "../types";
import { ideEvents } from "@/lib/events";
import { THEME_DEFINITIONS, migrateLegacyTheme } from "@/features/theme";

// Ensure Monaco runs completely offline from bundled npm module with offline Web Worker stub
if (typeof window !== "undefined") {
  const globalObj = window as unknown as {
    MonacoEnvironment?: {
      getWorker: (moduleId: unknown, label: string) => Worker;
    };
    monaco?: unknown;
  };

  // 1. Configure MonacoEnvironment to provide inline web workers
  // This satisfies Monaco's web worker requirement completely offline in Next.js Turbopack
  // and prevents worker 404s from raising [object ErrorEvent]
  globalObj.MonacoEnvironment = {
    getWorker: function () {
      const workerBlob = new Blob(
        [
          `self.onmessage = function () {
            // Offline stub worker
          };`
        ],
        { type: "application/javascript" }
      );
      return new Worker(URL.createObjectURL(workerBlob));
    },
  };

  // 2. Set window.monaco so @monaco-editor/loader can directly detect the local instance
  globalObj.monaco = monaco;

  // 3. Configure loader to use the bundled monaco instance directly
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
}

interface MonacoEditorViewProps {
  document: EditorDocument;
  onCursorChange?: (docPath: string, pos: {
    lineNumber: number;
    column: number;
    selectionCount?: number;
    totalLines?: number;
  }) => void;
}

export function MonacoEditorView({ document, onCursorChange }: MonacoEditorViewProps) {
  const { settings, updateContent, monacoEditorRef, isSplit } = useEditor();
  const minimapEnabled = !isSplit && (settings.minimap ?? true);
  const { settings: ideSettings } = useSettings();
  const suggestions = ideSettings.suggestions;
  const [currentTheme, setCurrentTheme] = useState("dark-modern");
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localEditorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentListenerRef = useRef<any>(null);

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

  // Dynamically toggle minimap when split view state or settings change
  useEffect(() => {
    const ed = localEditorRef.current;
    if (!ed) return;
    ed.updateOptions({
      minimap: { enabled: minimapEnabled },
    });
  }, [minimapEnabled]);

  // Intercept Ctrl/Cmd + Plus/Minus/Zero keyboard shortcuts inside editor container
  // to zoom the editor only, preventing whole-browser scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "_" || e.key === "0")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const ed = localEditorRef.current;
        if (!ed) return;

        if (e.key === "=" || e.key === "+") {
          ed.trigger("keyboard", "editor.action.fontZoomIn", null);
        } else if (e.key === "-" || e.key === "_") {
          ed.trigger("keyboard", "editor.action.fontZoomOut", null);
        } else if (e.key === "0") {
          ed.trigger("keyboard", "editor.action.fontZoomReset", null);
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown, true);
    return () => container.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Update attached model when document path or active document changes
  useEffect(() => {
    const editor = localEditorRef.current;
    if (!editor) return;

    const model = ModelService.createOrReuseModel(
      monaco,
      document.path,
      document.content,
      document.language
    );

    if (model) {
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
    // Only re-bind model when document identity or language changes, not on content keystrokes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.path, document.language, updateContent]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorDidMount = (editor: any) => {
    localEditorRef.current = editor;
    monacoEditorRef.current = editor;

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
      editor.setModel(model);
      ModelService.restoreViewState(editor, document.path);
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
      emitCursorPosition(editor);
    });

    editor.onMouseUp(() => {
      emitCursorPosition(editor);
    });

    editor.onKeyUp(() => {
      emitCursorPosition(editor);
    });

    // Emit initial position immediately upon mount
    emitCursorPosition(editor);

    // Context menu additions for Go To Definition and Peek
    editor.addAction({
      id: "kairo.goToDefinition",
      label: "Go to Definition",
      keybindings: [monaco.KeyCode.F12],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1,
      run: (ed: unknown) => NavigationService.goToDefinition(ed),
    });

    editor.addAction({
      id: "kairo.peekDefinition",
      label: "Peek Definition",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 2,
      run: (ed: unknown) => NavigationService.peekDefinition(ed),
    });

    editor.focus();
  };

  return (
    <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden bg-background isolate z-0">
      <Editor
        height="100%"
        width="100%"
        theme={currentTheme}
        options={{
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          tabSize: settings.tabSize,
          insertSpaces: settings.insertSpaces,
          wordWrap: settings.wordWrap,
          minimap: { enabled: minimapEnabled },
          lineNumbers: settings.lineNumbers,
          cursorBlinking: settings.cursorBlinking,
          renderWhitespace: settings.renderWhitespace,
          automaticLayout: true,
          smoothScrolling: true,
          mouseWheelZoom: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          formatOnPaste: false,
          formatOnType: false,
          scrollBeyondLastLine: false,
          fixedOverflowWidgets: false,
          padding: { top: 8, bottom: 8 },
          suggestFontSize: suggestions?.fontSize ?? 12,
          suggestLineHeight: Math.round((suggestions?.fontSize ?? 12) * 2),
          quickSuggestions:
            suggestions?.enabled !== false && (suggestions?.quickSuggestions ?? true)
              ? { other: true, comments: true, strings: true }
              : false,
          quickSuggestionsDelay: 10,
          suggestOnTriggerCharacters:
            suggestions?.enabled !== false && (suggestions?.suggestOnTriggerCharacters ?? true),
          acceptSuggestionOnEnter: suggestions?.acceptSuggestionOnEnter ?? "on",
          tabCompletion: (suggestions?.tabCompletion ?? "on") as "on" | "off" | "onlySnippets",
          snippetSuggestions: (suggestions?.snippetSuggestions ?? "inline") as "top" | "inline" | "bottom" | "none",
          wordBasedSuggestions: "allDocuments",
          suggest: {
            showIcons: suggestions?.showIcons ?? true,
            showStatusBar: true,
            preview: suggestions?.preview ?? true,
            previewMode: "subwordSmart",
            shareSuggestSelections: true,
            filterGraceful: true,
            localityBonus: true,
            snippetsPreventQuickSuggestions: false,
            showWords: true,
            showSnippets: suggestions?.snippetSuggestions !== "none",
            showKeywords: true,
            showFunctions: true,
            showClasses: true,
            showVariables: true,
            showConstants: true,
            showFields: true,
            showProperties: true,
            showEvents: true,
            showOperators: true,
            showUnits: true,
            showValues: true,
            showEnumMembers: true,
            showColors: true,
            showFiles: true,
            showReferences: true,
            showFolders: true,
            showTypeParameters: true,
            showModules: true,
            showStructs: true,
            showInterfaces: true,
          },
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  );
}
