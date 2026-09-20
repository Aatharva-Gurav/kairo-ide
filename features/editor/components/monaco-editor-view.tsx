"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEditor } from "../store";
import { ModelService } from "../services/model.service";
import { IntelliSenseService } from "../services/intellisense.service";
import { NavigationService } from "../services/navigation.service";
import { EditorDocument } from "../types";
import { ideEvents } from "@/lib/events";

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

  // 4. Register custom IDE themes matching Kairo and VS Code / popular palettes
  try {
    monaco.editor.defineTheme("kairo-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "71717a", fontStyle: "italic" },
        { token: "keyword", foreground: "a78bfa", fontStyle: "bold" },
        { token: "string", foreground: "34d399" },
        { token: "number", foreground: "fbbf24" },
        { token: "type", foreground: "38bdf8" },
        { token: "class", foreground: "38bdf8" },
        { token: "function", foreground: "60a5fa" },
        { token: "variable", foreground: "f4f4f5" },
        { token: "delimiter", foreground: "a1a1aa" },
      ],
      colors: {
        "editor.background": "#141416",
        "editor.foreground": "#f4f4f5",
        "editorCursor.foreground": "#a78bfa",
        "editor.lineHighlightBackground": "#1e1e24",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editor.selectionBackground": "#3b305480",
        "editor.inactiveSelectionBackground": "#27272a80",
        "editorIndentGuide.background": "#27272a",
        "editorIndentGuide.activeBackground": "#52525b",
        "editorBracketMatch.background": "#3f3f4650",
        "editorBracketMatch.border": "#8b5cf6",
      },
    });

    monaco.editor.defineTheme("kairo-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#18181b",
        "editorCursor.foreground": "#6366f1",
        "editor.lineHighlightBackground": "#f4f4f5",
        "editorLineNumber.foreground": "#a1a1aa",
        "editorLineNumber.activeForeground": "#18181b",
      },
    });

    monaco.editor.defineTheme("vs-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "class", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
        { token: "delimiter", foreground: "D4D4D4" },
      ],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#d4d4d4",
        "editorCursor.foreground": "#aeafad",
        "editor.lineHighlightBackground": "#282828",
        "editorLineNumber.foreground": "#858585",
        "editorLineNumber.activeForeground": "#c6c6c6",
        "editor.selectionBackground": "#264f78",
        "editor.inactiveSelectionBackground": "#3a3d41",
      },
    });

    monaco.editor.defineTheme("vs-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "008000", fontStyle: "italic" },
        { token: "keyword", foreground: "AF00DB" },
        { token: "string", foreground: "A31515" },
        { token: "number", foreground: "098658" },
        { token: "type", foreground: "267F99" },
        { token: "class", foreground: "267F99" },
        { token: "function", foreground: "795E26" },
        { token: "variable", foreground: "001080" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#000000",
        "editorCursor.foreground": "#000000",
        "editor.lineHighlightBackground": "#f5f5f5",
        "editorLineNumber.foreground": "#717171",
        "editorLineNumber.activeForeground": "#000000",
        "editor.selectionBackground": "#add6ff",
      },
    });

    monaco.editor.defineTheme("one-dark-pro", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6370", fontStyle: "italic" },
        { token: "keyword", foreground: "c678dd" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "e5c07b" },
        { token: "class", foreground: "e5c07b" },
        { token: "function", foreground: "61afef" },
        { token: "variable", foreground: "e06c75" },
        { token: "delimiter", foreground: "abb2bf" },
      ],
      colors: {
        "editor.background": "#282c34",
        "editor.foreground": "#abb2bf",
        "editorCursor.foreground": "#528bff",
        "editor.lineHighlightBackground": "#2c313c",
        "editorLineNumber.foreground": "#4b5263",
        "editorLineNumber.activeForeground": "#abb2bf",
        "editor.selectionBackground": "#3e4451",
        "editor.inactiveSelectionBackground": "#333842",
        "editorIndentGuide.background": "#3b4048",
        "editorIndentGuide.activeBackground": "#5c6370",
      },
    });

    monaco.editor.defineTheme("dracula", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4", fontStyle: "italic" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "string", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
        { token: "type", foreground: "8be9fd", fontStyle: "italic" },
        { token: "class", foreground: "8be9fd" },
        { token: "function", foreground: "50fa7b" },
        { token: "variable", foreground: "f8f8f2" },
        { token: "delimiter", foreground: "ff79c6" },
      ],
      colors: {
        "editor.background": "#282a36",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f0",
        "editor.lineHighlightBackground": "#44475a75",
        "editorLineNumber.foreground": "#6272a4",
        "editorLineNumber.activeForeground": "#f8f8f2",
        "editor.selectionBackground": "#44475a",
        "editor.inactiveSelectionBackground": "#343746",
        "editorIndentGuide.background": "#44475a80",
        "editorIndentGuide.activeBackground": "#bd93f9",
      },
    });

    monaco.editor.defineTheme("tokyo-night", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "565f89", fontStyle: "italic" },
        { token: "keyword", foreground: "bb9af7" },
        { token: "string", foreground: "9ece6a" },
        { token: "number", foreground: "ff9e64" },
        { token: "type", foreground: "2ac3de" },
        { token: "class", foreground: "2ac3de" },
        { token: "function", foreground: "7aa2f7" },
        { token: "variable", foreground: "c0caf5" },
        { token: "delimiter", foreground: "89ddff" },
      ],
      colors: {
        "editor.background": "#1a1b26",
        "editor.foreground": "#a9b1d6",
        "editorCursor.foreground": "#c0caf5",
        "editor.lineHighlightBackground": "#1f2335",
        "editorLineNumber.foreground": "#3b4261",
        "editorLineNumber.activeForeground": "#7aa2f7",
        "editor.selectionBackground": "#283457",
        "editor.inactiveSelectionBackground": "#222944",
        "editorIndentGuide.background": "#292e42",
        "editorIndentGuide.activeBackground": "#7aa2f7",
      },
    });

    monaco.editor.defineTheme("github-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "8b949e", fontStyle: "italic" },
        { token: "keyword", foreground: "ff7b72" },
        { token: "string", foreground: "a5d6ff" },
        { token: "number", foreground: "79c0ff" },
        { token: "type", foreground: "7ee787" },
        { token: "class", foreground: "ffa657" },
        { token: "function", foreground: "d2a8ff" },
        { token: "variable", foreground: "c9d1d9" },
        { token: "delimiter", foreground: "c9d1d9" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#c9d1d9",
        "editorCursor.foreground": "#58a6ff",
        "editor.lineHighlightBackground": "#161b22",
        "editorLineNumber.foreground": "#484f58",
        "editorLineNumber.activeForeground": "#c9d1d9",
        "editor.selectionBackground": "#1f6feb40",
        "editor.inactiveSelectionBackground": "#1f6feb20",
        "editorIndentGuide.background": "#21262d",
        "editorIndentGuide.activeBackground": "#30363d",
      },
    });

    monaco.editor.defineTheme("monokai", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "75715e", fontStyle: "italic" },
        { token: "keyword", foreground: "f92672" },
        { token: "string", foreground: "e6db74" },
        { token: "number", foreground: "ae81ff" },
        { token: "type", foreground: "66d9ef", fontStyle: "italic" },
        { token: "class", foreground: "a6e22e" },
        { token: "function", foreground: "a6e22e" },
        { token: "variable", foreground: "f8f8f2" },
        { token: "delimiter", foreground: "f8f8f2" },
      ],
      colors: {
        "editor.background": "#272822",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f0",
        "editor.lineHighlightBackground": "#3e3d32",
        "editorLineNumber.foreground": "#90908a",
        "editorLineNumber.activeForeground": "#f8f8f2",
        "editor.selectionBackground": "#49483e",
        "editor.inactiveSelectionBackground": "#3e3d32",
        "editorIndentGuide.background": "#3e3d32",
        "editorIndentGuide.activeBackground": "#75715e",
      },
    });
  } catch {
    // Themes already registered
  }
}

interface MonacoEditorViewProps {
  document: EditorDocument;
  onCursorChange?: (pos: { lineNumber: number; column: number }) => void;
}

export function MonacoEditorView({ document, onCursorChange }: MonacoEditorViewProps) {
  const { settings, updateContent, monacoEditorRef } = useEditor();
  const [currentTheme, setCurrentTheme] = useState("kairo-dark");
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localEditorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentListenerRef = useRef<any>(null);

  // Sync theme with data-theme attribute and dark class on <html>
  useEffect(() => {
    const updateTheme = () => {
      if (typeof window === "undefined") return;
      const root = window.document.documentElement;
      const themeAttr = root.getAttribute("data-theme") || "dark";
      const isDarkClass = root.classList.contains("dark");

      if (themeAttr === "system") {
        setCurrentTheme(isDarkClass ? "kairo-dark" : "kairo-light");
      } else if (themeAttr === "dark") {
        setCurrentTheme("kairo-dark");
      } else if (themeAttr === "light") {
        setCurrentTheme("kairo-light");
      } else {
        setCurrentTheme(themeAttr);
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

    if (model && editor.getModel() !== model) {
      ModelService.saveViewState(editor, document.path);
      editor.setModel(model);
      ModelService.restoreViewState(editor, document.path);
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
    editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
      if (onCursorChange) {
        onCursorChange(e.position);
      }
    });

    // Content change listener
    if (model) {
      contentListenerRef.current = model.onDidChangeContent(() => {
        updateContent(document.path, model.getValue());
      });
    }

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
    <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden bg-background">
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
          minimap: { enabled: settings.minimap },
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
          fixedOverflowWidgets: true,
          padding: { top: 8, bottom: 8 },
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  );
}
