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
import { EditorFindReplace } from "./editor-find-replace";

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
  // and safely returns valid defaults for all worker queries
  globalObj.MonacoEnvironment = {
    getWorker: function () {
      const workerBlob = new Blob(
        [
          `self.onmessage = function (e) {
            if (e && e.data && typeof e.data === 'object' && e.data.type === 0) {
              var method = e.data.method;
              var args = e.data.args;
              if (method === '$fmr' && Array.isArray(args) && typeof args[0] === 'string') {
                method = args[0];
                args = args[1];
              }

              var res = null;
              if (method === 'getRenameInfo') {
                res = { canRename: false, localizedErrorMessage: 'Rename is not supported.' };
              } else if (method === 'computeDiff') {
                res = { changes: [], identical: true, quitEarly: false };
              } else if (
                method === 'getSyntacticDiagnostics' ||
                method === 'getSemanticDiagnostics' ||
                method === 'getSuggestionDiagnostics' ||
                method === 'getCompilerOptionsDiagnostics' ||
                method === 'provideInlayHints' ||
                method === 'getCodeFixesAtPosition' ||
                method === 'findRenameLocations' ||
                method === 'getDefinitionAtPosition' ||
                method === 'getReferencesAtPosition' ||
                method === 'getDocumentHighlights' ||
                method === 'getFormattingEditsForRange' ||
                method === 'getFormattingEditsForDocument' ||
                method === 'getFormattingEditsAfterKeystroke' ||
                method === 'doValidation' ||
                method === 'findDocumentSymbols' ||
                method === 'findDocumentColors' ||
                method === 'getColorPresentations' ||
                method === 'getFoldingRanges' ||
                method === 'getSelectionRanges' ||
                method === 'findDocumentHighlights' ||
                method === 'findDefinition' ||
                method === 'findReferences' ||
                method === 'findDocumentLinks'
              ) {
                res = [];
              } else {
                res = null;
              }
              self.postMessage({ vsWorker: e.data.vsWorker, seq: e.data.req, type: 1, res: res });
            }
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

  // 5. Initialize Monaco language defaults and disable internal worker adapters
  IntelliSenseService.init(monaco);
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
  const {
    settings,
    updateContent,
    saveDocument,
    closeDocument,
    formatActiveDocument,
    monacoEditorRef,
    isSplit,
    setGoToLineVisible,
    setQuickOpenVisible,
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

  // Listen to menubar or global find and replace triggers
  useEffect(() => {
    const unsubs = [
      ideEvents.on("editor:find", (payload) => {
        if (!payload || !payload.path || payload.path === document.path) {
          setIsFindOpen(true);
          setIsReplaceMode(false);
        }
      }),
      ideEvents.on("editor:replace", (payload) => {
        if (!payload || !payload.path || payload.path === document.path) {
          setIsFindOpen(true);
          setIsReplaceMode(true);
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [document.path]);

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
    // Re-bind when document identity, language, content, or editor instance changes
  }, [document.path, document.language, document.content, updateContent, editorInstance]);

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

      // Bind content changes immediately on mount
      if (contentListenerRef.current) {
        contentListenerRef.current.dispose();
      }
      contentListenerRef.current = model.onDidChangeContent(() => {
        const val = model.getValue();
        updateContent(document.path, val);
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

    // Command: Ctrl/Cmd+S Save Document
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveDocument(document.path);
    });

    // Command: Ctrl/Cmd+W Close Active Document Tab
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      closeDocument(document.path);
    });

    // Command: Ctrl/Cmd+P Quick Open File Modal
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
      setQuickOpenVisible(true);
    });

    // Command: Ctrl/Cmd+G Go To Line Modal
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      setGoToLineVisible(true);
    });

    // Command: Shift+Alt+F Format Active Document
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      formatActiveDocument();
    });

    // Intercept Ctrl/Cmd+F and Ctrl/Cmd+H inside Monaco editor to trigger custom Find & Replace
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      setIsFindOpen(true);
      setIsReplaceMode(false);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      setIsFindOpen(true);
      setIsReplaceMode(true);
    });

    // Keyboard navigation actions (F12 / Alt+F12)
    editor.addAction({
      id: "kairo.goToDefinition",
      label: "Go to Definition",
      keybindings: [monaco.KeyCode.F12],
      run: (ed: unknown) => NavigationService.goToDefinition(ed),
    });

    editor.addAction({
      id: "kairo.peekDefinition",
      label: "Peek Definition",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      run: (ed: unknown) => NavigationService.peekDefinition(ed),
    });

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
        options={{
          contextmenu: false,
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          tabSize: settings.tabSize,
          insertSpaces: settings.insertSpaces,
          wordWrap: settings.wordWrap,
          minimap: { enabled: minimapEnabled },
          lineNumbers: settings.lineNumbers,
          cursorBlinking: settings.cursorBlinking || "smooth",
          cursorSmoothCaretAnimation: "on",
          renderLineHighlight: "all",
          renderLineHighlightOnlyWhenFocus: false,
          folding: true,
          foldingHighlight: true,
          showFoldingControls: "always",
          renderWhitespace: settings.renderWhitespace,
          automaticLayout: true,
          smoothScrolling: true,
          mouseWheelZoom: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true, bracketPairsHorizontal: true },
          formatOnPaste: false,
          formatOnType: false,
          scrollBeyondLastLine: false,
          fixedOverflowWidgets: false,
          padding: { top: 8, bottom: 8 },
          inlayHints: {
            enabled: "off",
          },
          suggestFontSize: suggestions?.fontSize ?? 12,
          suggestLineHeight: Math.round((suggestions?.fontSize ?? 12) * 2),
          quickSuggestions: { other: true, comments: true, strings: true },
          quickSuggestionsDelay: 10,
          suggestOnTriggerCharacters: true,
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
