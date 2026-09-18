"use client";

import React, { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEditor } from "../store";
import { ModelService } from "../services/model.service";
import { IntelliSenseService } from "../services/intellisense.service";
import { NavigationService } from "../services/navigation.service";
import { EditorDocument } from "../types";

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

  // 4. Register custom IDE themes matching Kairo's dark / light palette
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
  const [isDark, setIsDark] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localEditorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentListenerRef = useRef<any>(null);

  // Sync theme with dark class on <html>
  useEffect(() => {
    const checkDark = () => {
      const isDarkTheme = documentElementHasDark();
      setIsDark(isDarkTheme);
    };

    function documentElementHasDark() {
      if (typeof window === "undefined") return true;
      return window.document.documentElement.classList.contains("dark");
    }

    checkDark();

    const observer = new MutationObserver(() => {
      checkDark();
    });

    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
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
    <div className="relative flex-1 w-full h-full overflow-hidden bg-background">
      <Editor
        height="100%"
        width="100%"
        theme={isDark ? "kairo-dark" : "kairo-light"}
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
