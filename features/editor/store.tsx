"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  EditorDocument,
  EditorSettings,
  FilesSettings,
  DirtyCloseConfirmAction,
  SplitDirection,
  SplitLayoutMode,
} from "./types";
import { EditorService } from "./services/editor.service";
import { ModelService } from "./services/model.service";
import { FormatterService } from "./services/formatter.service";
import { BufferSyncService } from "./services/buffer-sync.service";
import { DiffService } from "@/lib/diff/diff-service";
import { ConflictDetails } from "@/lib/diff/types";
import {
  EditorPaneId,
  createPaneFocusState,
  registerPaneEditorInState,
  focusPaneInState,
} from "./services/pane-focus";
import { ideEvents } from "@/lib/events";
import { normalizePath, basename, isTauriEnvironment, invokeCommand } from "@/lib/tauri-ipc";
import { fsWatcher } from "@/lib/watcher";

export type { EditorPaneId };

export interface EditorContextValue {
  documents: EditorDocument[];
  activeDocumentId: string | null;
  activeDocument: EditorDocument | null;
  settings: EditorSettings;
  filesSettings: FilesSettings;
  dirtyCloseCandidate: EditorDocument | null;
  isQuickOpenVisible: boolean;
  isGoToLineVisible: boolean;

  // Split view
  isSplit: boolean;
  splitDirection: SplitDirection;
  splitLayoutMode: SplitLayoutMode;
  splitDocumentId: string | null;
  splitDocument: EditorDocument | null;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  openSplitView: (filePath?: string, direction?: SplitDirection) => void;
  openSplitRight: (filePath?: string) => void;
  openSplitDown: (filePath?: string) => void;
  closeSplitView: () => void;
  toggleSplitView: () => void;
  toggleSplitOrientation: () => void;
  swapSplitDocuments: () => void;
  setSplitDocumentId: (filePath: string) => void;

  // Editor-only zoom
  editorZoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  openDocument: (filePath: string, initialContent?: string) => Promise<EditorDocument>;
  openFileDialog: () => Promise<EditorDocument | null>;
  closeDocument: (filePath: string, force?: boolean) => Promise<boolean>;
  closeDocuments: (filePaths: string[], force?: boolean) => Promise<boolean>;
  closeAllDocuments: () => Promise<boolean>;
  cleanupEditor: (force?: boolean) => Promise<void>;
  closeOtherDocuments: (filePath: string) => Promise<boolean>;
  setActiveDocumentId: (filePath: string) => void;
  updateContent: (filePath: string, newContent: string) => void;
  saveDocument: (filePath?: string) => Promise<boolean>;
  saveAllDocuments: () => Promise<boolean>;
  formatActiveDocument: () => Promise<boolean>;
  confirmDirtyClose: (action: DirtyCloseConfirmAction) => Promise<void>;
  updateSettings: (newSettings: Partial<EditorSettings>) => void;
  revealInExplorer: (filePath: string) => void;
  setQuickOpenVisible: (visible: boolean) => void;
  setGoToLineVisible: (visible: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monacoEditorRef: React.MutableRefObject<any>;
  focusedPane: EditorPaneId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerPaneEditor: (paneId: EditorPaneId, editor: any | null) => void;
  focusPane: (paneId: EditorPaneId, docPath?: string | null) => void;

  // Focused Document tracking for workbench status bar
  focusedDocument: EditorDocument | null;
  bufferConflicts: Record<string, ConflictDetails>;
  clearBufferConflict: (path: string) => void;
  handleCursorChange: (
    docPath: string,
    pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
  ) => void;
  setFocusedDocPath: (path: string | null) => void;
}

export interface EditorCursorPosition {
  lineNumber: number;
  column: number;
  selectionCount?: number;
  totalLines?: number;
}

const EditorContext = createContext<EditorContextValue | null>(null);
const EditorCursorContext = createContext<EditorCursorPosition | undefined>(undefined);

import { SettingsService } from "@/features/settings/services/settings.service";

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<EditorDocument[]>([]);
  const [activeDocumentId, setActiveDocumentIdState] = useState<string | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(() => {
    return SettingsService.getEffectiveSettings().editor;
  });
  const [filesSettings, setFilesSettings] = useState<FilesSettings>(() => {
    return SettingsService.getEffectiveSettings().files;
  });

  // Split view state
  const [isSplit, setIsSplit] = useState(false);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("horizontal");
  const [splitLayoutMode, setSplitLayoutMode] = useState<SplitLayoutMode>("single");
  const [splitDocumentId, setSplitDocumentIdState] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);

  // Editor-only zoom level (0 = 100%, +1 = 110%, etc.)
  const [editorZoomLevel, setEditorZoomLevel] = useState(0);

  // Auto-save debounce timer map
  const autoSaveTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const filesSettingsRef = useRef(filesSettings);
  useEffect(() => {
    filesSettingsRef.current = filesSettings;
  }, [filesSettings]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const splitDocumentIdRef = useRef(splitDocumentId);
  useEffect(() => {
    splitDocumentIdRef.current = splitDocumentId;
  }, [splitDocumentId]);

  // Subscribe to live settings updates
  useEffect(() => {
    return SettingsService.subscribe((newEffective) => {
      setSettings(newEffective.editor);
      setFilesSettings(newEffective.files);
    });
  }, []);

  const [dirtyCloseCandidate, setDirtyCloseCandidate] = useState<EditorDocument | null>(null);
  const [isQuickOpenVisible, setQuickOpenVisible] = useState(false);
  const [isGoToLineVisible, setGoToLineVisible] = useState(false);
  const [bufferConflicts, setBufferConflicts] = useState<Record<string, ConflictDetails>>({});
  const workspaceGenerationRef = useRef(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoEditorRef = useRef<any>(null);
  const [focusedPane, setFocusedPane] = useState<EditorPaneId>("primary");
  const focusedPaneRef = useRef<EditorPaneId>("primary");
  const paneFocusStateRef = useRef(createPaneFocusState());
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const activeDocumentIdRef = useRef(activeDocumentId);
  useEffect(() => {
    activeDocumentIdRef.current = activeDocumentId;
  }, [activeDocumentId]);

  const activeDocument = useMemo(() => {
    if (!activeDocumentId) return null;
    return documents.find((doc) => doc.id === activeDocumentId) || null;
  }, [documents, activeDocumentId]);

  const splitDocument = useMemo(() => {
    if (!splitDocumentId) return null;
    return documents.find((doc) => doc.id === splitDocumentId) || null;
  }, [documents, splitDocumentId]);

  // Cursor and focus state tracked centrally for workbench status bar
  const [cursorMap, setCursorMap] = useState<
    Record<
      string,
      { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    >
  >({});
  const [focusedDocPath, setFocusedDocPath] = useState<string | null>(null);

  const registerPaneEditor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (paneId: EditorPaneId, editor: any | null) => {
      const next = registerPaneEditorInState(paneFocusStateRef.current, paneId, editor);
      monacoEditorRef.current = paneFocusStateRef.current.monacoEditorRef.current;
      focusedPaneRef.current = next.focusedPane;
      setFocusedPane(next.focusedPane);
    },
    []
  );

  const focusPane = useCallback((paneId: EditorPaneId, docPath?: string | null) => {
    const next = focusPaneInState(paneFocusStateRef.current, paneId, docPath);
    monacoEditorRef.current = paneFocusStateRef.current.monacoEditorRef.current;
    focusedPaneRef.current = next.focusedPane;
    setFocusedPane(next.focusedPane);
    if (docPath !== undefined) {
      setFocusedDocPath(docPath);
    }
  }, []);

  const handleCursorChange = useCallback(
    (
      docPath: string,
      pos: { lineNumber: number; column: number; selectionCount?: number; totalLines?: number }
    ) => {
      setFocusedDocPath((prev) => (prev === docPath ? prev : docPath));
      setCursorMap((prev) => {
        const existing = prev[docPath];
        if (
          existing &&
          existing.lineNumber === pos.lineNumber &&
          existing.column === pos.column &&
          existing.selectionCount === pos.selectionCount &&
          existing.totalLines === pos.totalLines
        ) {
          return prev;
        }
        return {
          ...prev,
          [docPath]: pos,
        };
      });
    },
    []
  );

  const focusedDocument = useMemo(() => {
    if (isSplit && splitDocument && focusedPane === "split") {
      return splitDocument;
    }
    if (isSplit && splitDocument && focusedDocPath === splitDocument.path && focusedDocPath !== activeDocument?.path) {
      return splitDocument;
    }
    return activeDocument;
  }, [isSplit, splitDocument, activeDocument, focusedPane, focusedDocPath]);

  const focusedCursorPos = useMemo(() => {
    if (!focusedDocument) return undefined;
    return (
      cursorMap[focusedDocument.path] || {
        lineNumber: 1,
        column: 1,
        totalLines: focusedDocument.content
          ? focusedDocument.content.split(/\r\n|\r|\n/).length
          : 1,
      }
    );
  }, [focusedDocument, cursorMap]);

  // Split view actions
  const openSplitView = useCallback((filePath?: string, direction: SplitDirection = "horizontal") => {
    const target =
      filePath
        ? normalizePath(filePath)
        : activeDocumentIdRef.current || (documentsRef.current[0]?.id ?? null);
    if (target) {
      setSplitDocumentIdState(target);
      setSplitDirection(direction);
      setSplitLayoutMode(direction === "vertical" ? "split-down" : "split-right");
      setSplitRatio(0.5);
      setIsSplit(true);
    }
  }, []);

  const openSplitRight = useCallback((filePath?: string) => {
    openSplitView(filePath, "horizontal");
  }, [openSplitView]);

  const openSplitDown = useCallback((filePath?: string) => {
    openSplitView(filePath, "vertical");
  }, [openSplitView]);

  const closeSplitView = useCallback(() => {
    setIsSplit(false);
    setSplitLayoutMode("single");
    setSplitDocumentIdState(null);
    focusPane("primary", activeDocumentIdRef.current);
  }, [focusPane]);

  useEffect(() => {
    if (!isSplit && focusedPaneRef.current === "split") {
      focusPane("primary", activeDocumentIdRef.current);
    }
  }, [isSplit, focusPane]);

  const toggleSplitView = useCallback(() => {
    setIsSplit((prev) => {
      if (prev) {
        setSplitLayoutMode("single");
        setSplitDocumentIdState(null);
        return false;
      }
      const target =
        activeDocumentIdRef.current || (documentsRef.current[0]?.id ?? null);
      if (target) {
        setSplitDocumentIdState(target);
        setSplitDirection("horizontal");
        setSplitLayoutMode("split-right");
        setSplitRatio(0.5);
        return true;
      }
      return false;
    });
  }, []);

  const toggleSplitOrientation = useCallback(() => {
    setIsSplit((prev) => {
      if (!prev) {
        const target =
          activeDocumentIdRef.current || (documentsRef.current[0]?.id ?? null);
        if (target) {
          setSplitDocumentIdState(target);
          setSplitDirection("horizontal");
          setSplitLayoutMode("split-right");
          return true;
        }
        return false;
      }
      return true;
    });

    setSplitDirection((prev) => {
      const next = prev === "horizontal" ? "vertical" : "horizontal";
      setSplitLayoutMode(next === "vertical" ? "split-down" : "split-right");
      return next;
    });
  }, []);

  const swapSplitDocuments = useCallback(() => {
    const currentActive = activeDocumentIdRef.current;
    const currentSplit = splitDocumentIdRef.current;
    if (currentActive && currentSplit) {
      setActiveDocumentIdState(currentSplit);
      setSplitDocumentIdState(currentActive);
      ideEvents.emit("editor:active-changed", { path: currentSplit });
    }
  }, []);

  const setSplitDocumentId = useCallback((filePath: string) => {
    setSplitDocumentIdState(normalizePath(filePath));
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setEditorZoomLevel((prev) => Math.min(prev + 1, 10));
    ideEvents.emit("editor:zoom-in", undefined);
  }, []);

  const zoomOut = useCallback(() => {
    setEditorZoomLevel((prev) => Math.max(prev - 1, -5));
    ideEvents.emit("editor:zoom-out", undefined);
  }, []);

  const zoomReset = useCallback(() => {
    setEditorZoomLevel(0);
    ideEvents.emit("editor:zoom-reset", undefined);
  }, []);

  // Update settings through central SettingsService
  const updateSettings = useCallback((partial: Partial<EditorSettings>) => {
    Object.entries(partial).forEach(([key, val]) => {
      SettingsService.updateSetting(`editor.${key}`, val, "user");
    });
  }, []);

  // Forward-ref for saveDocument so callbacks and event handlers can invoke it without circular dependencies
  const saveDocumentRef = useRef<((filePath?: string) => Promise<boolean>) | null>(null);

  const saveDocument = useCallback(
    async (filePath?: string): Promise<boolean> => {
      const targetId = filePath ? normalizePath(filePath) : activeDocumentIdRef.current;
      if (!targetId) return false;

      // Clear any pending debounce auto-save timer for this file
      const pendingTimer = autoSaveTimersRef.current.get(targetId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        autoSaveTimersRef.current.delete(targetId);
      }

      const doc = documentsRef.current.find((d) => d.id === targetId);
      if (!doc || doc.isBinary || doc.readonly) return false;

      try {
        const formatTargetEditor =
          (focusedPaneRef.current === "split" && splitDocumentIdRef.current === targetId
            ? paneFocusStateRef.current.editors.split
            : activeDocumentIdRef.current === targetId
              ? paneFocusStateRef.current.editors.primary
              : null) || null;
        if (settings.formatOnSave && formatTargetEditor) {
          await FormatterService.formatMonacoDocument(formatTargetEditor);
        }

        // Always prioritize the active Monaco model's live content if available
        const activeModel = ModelService.getModel(targetId);
        let contentToSave = activeModel ? activeModel.getValue() : doc.content;

        if (filesSettingsRef.current.trimTrailingWhitespace) {
          contentToSave = contentToSave
            .split("\n")
            .map((line: string) => line.replace(/[ \t]+$/, ""))
            .join("\n");
        }
        if (filesSettingsRef.current.insertFinalNewline && !contentToSave.endsWith("\n")) {
          contentToSave += "\n";
        }
        if (filesSettingsRef.current.encoding === "ascii") {
          contentToSave = contentToSave.replace(/[^\x00-\x7F]/g, "?");
        }

        if (activeModel && !activeModel.isDisposed() && activeModel.getValue() !== contentToSave) {
          activeModel.setValue(contentToSave);
        }

        await EditorService.saveDocument(doc.path, contentToSave);

        // Update both state and ref immediately
        const updatedDoc = {
          ...doc,
          content: contentToSave,
          savedContent: contentToSave,
          isDirty: false,
          error: null,
        };

        documentsRef.current = documentsRef.current.map((d) =>
          d.id === targetId ? updatedDoc : d
        );

        setDocuments((prev) =>
          prev.map((d) => (d.id === targetId ? updatedDoc : d))
        );

        BufferSyncService.clearConflict(targetId);
        ideEvents.emit("editor:document-saved", { path: targetId });
        ideEvents.emit("editor:document-changed", { path: targetId, isDirty: false });
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Save failed.";
        setDocuments((prev) =>
          prev.map((d) => (d.id === targetId ? { ...d, error: msg } : d))
        );
        return false;
      }
    },
    [settings.formatOnSave]
  );

  useEffect(() => {
    saveDocumentRef.current = saveDocument;
  }, [saveDocument]);

  const setActiveDocumentId = useCallback((filePath: string) => {
    const norm = normalizePath(filePath);
    const prevId = activeDocumentIdRef.current;

    // Auto-save on focus change
    if (prevId && prevId !== norm) {
      const mode = filesSettingsRef.current.autoSave;
      if (mode === "onFocusChange") {
        const prevDoc = documentsRef.current.find((d) => d.id === prevId);
        if (prevDoc && prevDoc.isDirty && saveDocumentRef.current) {
          saveDocumentRef.current(prevId);
        }
      }
    }

    if (activeDocumentIdRef.current && monacoEditorRef.current) {
      ModelService.saveViewState(monacoEditorRef.current, activeDocumentIdRef.current);
    }
    setActiveDocumentIdState(norm);
    ideEvents.emit("editor:active-changed", { path: norm });
  }, []);

  const updateContent = useCallback((filePath: string, newContent: string) => {
    const norm = normalizePath(filePath);

    documentsRef.current = documentsRef.current.map((doc) => {
      if (doc.id === norm) {
        const isDirty = newContent !== doc.savedContent;
        return { ...doc, content: newContent, isDirty };
      }
      return doc;
    });

    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === norm) {
          const isDirty = newContent !== doc.savedContent;
          if (doc.isDirty !== isDirty) {
            ideEvents.emit("editor:document-changed", { path: norm, isDirty });
          }
          return { ...doc, content: newContent, isDirty };
        }
        return doc;
      })
    );

    // Auto-save: afterDelay
    if (filesSettingsRef.current.autoSave === "afterDelay") {
      const existingTimer = autoSaveTimersRef.current.get(norm);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const delay = Math.max(200, filesSettingsRef.current.autoSaveDelay || 1000);
      const timer = setTimeout(() => {
        autoSaveTimersRef.current.delete(norm);
        const currentDoc = documentsRef.current.find((d) => d.id === norm);
        if (currentDoc && currentDoc.isDirty && saveDocumentRef.current) {
          saveDocumentRef.current(norm);
        }
      }, delay);
      autoSaveTimersRef.current.set(norm, timer);
    }
  }, []);

  const openDocument = useCallback(
    async (filePath: string, initialContent?: string): Promise<EditorDocument> => {
      const norm = normalizePath(filePath);

      // Check if file is already open
      const existing = documentsRef.current.find((doc) => doc.id === norm);
      if (existing) {
        if (initialContent !== undefined && initialContent !== existing.content) {
          updateContent(norm, initialContent);
          ModelService.updateContent(norm, initialContent);
        }
        setActiveDocumentId(norm);
        return existing;
      }

      // Load document from disk
      const doc = await EditorService.loadDocument(norm, initialContent);

      documentsRef.current = documentsRef.current.some((d) => d.id === norm)
        ? documentsRef.current
        : [...documentsRef.current, doc];

      setDocuments((prev) => {
        if (prev.some((d) => d.id === norm)) return prev;
        return [...prev, doc];
      });

      // Synchronize model content if existing model was loaded
      ModelService.updateContent(norm, doc.content);

      setActiveDocumentId(norm);
      ideEvents.emit("editor:document-opened", { path: norm });
      return doc;
    },
    [setActiveDocumentId, updateContent]
  );

  const openFileDialog = useCallback(async (): Promise<EditorDocument | null> => {
    try {
      if (isTauriEnvironment()) {
        const picked = await invokeCommand<string | null>("workspace_pick_file");
        if (picked) {
          return await openDocument(picked);
        }
      } else {
        return new Promise<EditorDocument | null>((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) {
              resolve(null);
              return;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nativePath = (file as any).path;
            if (nativePath) {
              const doc = await openDocument(nativePath);
              resolve(doc);
            } else {
              const content = await file.text();
              const doc = await openDocument(file.name, content);
              resolve(doc);
            }
          };
          input.click();
        });
      }
    } catch (err) {
      console.error("Failed to pick file:", err);
    }
    return null;
  }, [openDocument]);

  const closeDocument = useCallback(
    async (filePath: string, force = false): Promise<boolean> => {
      const norm = normalizePath(filePath);
      const doc = documentsRef.current.find((d) => d.id === norm);
      if (!doc) return true;

      const activeModel = ModelService.getModel(norm);
      const isActuallyDirty =
        doc.isDirty ||
        (activeModel && !activeModel.isDisposed() && activeModel.getValue() !== doc.savedContent);

      if (isActuallyDirty && !force) {
        const autoSaveMode = filesSettingsRef.current.autoSave;
        if (autoSaveMode !== "off" && saveDocumentRef.current) {
          await saveDocumentRef.current(norm);
        } else if (settingsRef.current.confirmCloseUnsaved !== false) {
          setDirtyCloseCandidate({
            ...doc,
            content:
              activeModel && !activeModel.isDisposed() ? activeModel.getValue() : doc.content,
            isDirty: true,
          });
          return false;
        }
      }

      // Clear pending auto-save timer
      const pendingTimer = autoSaveTimersRef.current.get(norm);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        autoSaveTimersRef.current.delete(norm);
      }

      ModelService.disposeModel(norm);

      // Find index of document before mutating documentsRef
      const currentDocs = documentsRef.current || [];
      const closedIdx = currentDocs.findIndex((d) => d.id === norm);

      const remaining = currentDocs.filter((d) => d.id !== norm);
      documentsRef.current = remaining;
      setDocuments(remaining);

      // If closed active document, switch to adjacent
      if (activeDocumentIdRef.current === norm) {
        if (remaining.length > 0) {
          const nextIdx = Math.max(0, Math.min(closedIdx >= 0 ? closedIdx : 0, remaining.length - 1));
          const targetDoc = remaining[nextIdx];
          if (targetDoc) {
            setActiveDocumentId(targetDoc.id);
          } else {
            setActiveDocumentIdState(null);
            ideEvents.emit("editor:active-changed", { path: null });
          }
        } else {
          setActiveDocumentIdState(null);
          ideEvents.emit("editor:active-changed", { path: null });
        }
      }

      // If closed split document, reassign or close split
      if (splitDocumentIdRef.current === norm) {
        const remainingForSplit = (remaining || []).filter((d) => d.id !== norm);
        if (remainingForSplit.length > 0) {
          setSplitDocumentIdState(remainingForSplit[0].id);
        } else {
          setIsSplit(false);
          setSplitLayoutMode("single");
          setSplitDocumentIdState(null);
        }
      }

      ideEvents.emit("editor:document-closed", { path: norm });
      return true;
    },
    [setActiveDocumentId]
  );

  const closeDocuments = useCallback(
    async (filePaths: string[], force = false): Promise<boolean> => {
      if (!filePaths || filePaths.length === 0) return true;

      const normalizedTargets = filePaths.map((p) => normalizePath(p).toLowerCase());

      const isTarget = (docId: string) => {
        const normDoc = normalizePath(docId).toLowerCase();
        for (const target of normalizedTargets) {
          if (
            normDoc === target ||
            normDoc.startsWith(target + "/") ||
            normDoc.startsWith(target + "\\")
          ) {
            return true;
          }
        }
        return false;
      };

      const currentDocs = documentsRef.current || [];
      const docsToClose = currentDocs.filter((d) => isTarget(d.id));
      if (docsToClose.length === 0) return true;

      if (!force) {
        const dirtyDocs = (docsToClose || []).filter((d) => d.isDirty);
        if (dirtyDocs.length > 0 && filesSettingsRef.current.autoSave !== "off" && saveDocumentRef.current) {
          for (const doc of dirtyDocs) {
            await saveDocumentRef.current(doc.id);
          }
        }
      }

      // Dispose models and clear timers
      for (const doc of docsToClose) {
        const norm = normalizePath(doc.id);
        const pendingTimer = autoSaveTimersRef.current.get(norm);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          autoSaveTimersRef.current.delete(norm);
        }
        ModelService.disposeModel(norm);
        ideEvents.emit("editor:document-closed", { path: norm });
      }

      const closedIds = new Set(docsToClose.map((d) => d.id));
      const remaining = currentDocs.filter((d) => !closedIds.has(d.id));
      documentsRef.current = remaining;
      setDocuments(remaining);

      // If active document was closed, switch to another remaining document
      if (activeDocumentIdRef.current && closedIds.has(activeDocumentIdRef.current)) {
        if (remaining.length > 0) {
          setActiveDocumentId(remaining[remaining.length - 1].id);
        } else {
          setActiveDocumentIdState(null);
          ideEvents.emit("editor:active-changed", { path: null });
        }
      }

      // If split document was closed
      if (splitDocumentIdRef.current && closedIds.has(splitDocumentIdRef.current)) {
        const remainingForSplit = (remaining || []).filter((d) => d.id !== activeDocumentIdRef.current);
        if (remainingForSplit.length > 0) {
          setSplitDocumentIdState(remainingForSplit[0].id);
        } else {
          setIsSplit(false);
          setSplitLayoutMode("single");
          setSplitDocumentIdState(null);
        }
      }

      return true;
    },
    [setActiveDocumentId]
  );

  const closeAllDocuments = useCallback(async (): Promise<boolean> => {
    const currentDocs = documentsRef.current || [];
    const dirtyDocs = currentDocs.filter((d) => d.isDirty);
    if (dirtyDocs.length > 0) {
      if (filesSettingsRef.current.autoSave !== "off" && saveDocumentRef.current) {
        for (const doc of dirtyDocs) {
          await saveDocumentRef.current(doc.id);
        }
      } else if (settingsRef.current.confirmCloseUnsaved !== false) {
        setDirtyCloseCandidate(dirtyDocs[0]);
        return false;
      }
    }

    autoSaveTimersRef.current.forEach((t) => clearTimeout(t));
    autoSaveTimersRef.current.clear();

    ModelService.disposeAll();
    documentsRef.current = [];
    setDocuments([]);
    setActiveDocumentIdState(null);
    closeSplitView();
    ideEvents.emit("editor:active-changed", { path: null });
    return true;
  }, [closeSplitView]);

  const cleanupEditor = useCallback(
    async (force = true): Promise<void> => {
      const currentDocs = documentsRef.current || [];
      const dirtyDocs = currentDocs.filter((d) => d.isDirty);
      if (!force && dirtyDocs.length > 0) {
        if (filesSettingsRef.current.autoSave !== "off" && saveDocumentRef.current) {
          for (const doc of dirtyDocs) {
            await saveDocumentRef.current(doc.id);
          }
        } else if (settingsRef.current.confirmCloseUnsaved !== false) {
          setDirtyCloseCandidate(dirtyDocs[0]);
          return;
        }
      }

      autoSaveTimersRef.current.forEach((t) => clearTimeout(t));
      autoSaveTimersRef.current.clear();

      ModelService.disposeAll();
      documentsRef.current = [];
      setDocuments([]);
      setActiveDocumentIdState(null);
      setSplitDocumentIdState(null);
      closeSplitView();
      setDirtyCloseCandidate(null);
      setBufferConflicts({});
      setQuickOpenVisible(false);
      setGoToLineVisible(false);
      ideEvents.emit("editor:active-changed", { path: null });
    },
    [closeSplitView]
  );

  const closeOtherDocuments = useCallback(
    async (filePath: string): Promise<boolean> => {
      const norm = normalizePath(filePath);
      const currentDocs = documentsRef.current || [];
      const others = currentDocs.filter((d) => d.id !== norm);
      const dirtyOthers = (others || []).filter((d) => d.isDirty);

      if (dirtyOthers.length > 0) {
        if (filesSettingsRef.current.autoSave !== "off" && saveDocumentRef.current) {
          for (const doc of dirtyOthers) {
            await saveDocumentRef.current(doc.id);
          }
        } else if (settingsRef.current.confirmCloseUnsaved !== false) {
          setDirtyCloseCandidate(dirtyOthers[0]);
          return false;
        }
      }

      others.forEach((d) => {
        const pendingTimer = autoSaveTimersRef.current.get(d.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          autoSaveTimersRef.current.delete(d.id);
        }
        ModelService.disposeModel(d.id);
      });

      const remaining = currentDocs.filter((d) => d.id === norm);
      documentsRef.current = remaining;
      setDocuments(remaining);
      setActiveDocumentId(norm);
      if (splitDocumentIdRef.current && splitDocumentIdRef.current !== norm) {
        closeSplitView();
      }
      return true;
    },
    [setActiveDocumentId, closeSplitView]
  );

  const saveAllDocuments = useCallback(async (): Promise<boolean> => {
    const dirtyDocs = (documentsRef.current || []).filter(
      (doc) => doc && doc.isDirty && !doc.isBinary && !doc.readonly
    );
    if (dirtyDocs.length === 0) return true;

    const results = await Promise.all(
      dirtyDocs.map(async (doc) => {
        if (saveDocumentRef.current) {
          return await saveDocumentRef.current(doc.id);
        }
        return false;
      })
    );
    return results.every(Boolean);
  }, []);

  // React immediately to live autoSave / autoSaveDelay setting changes
  useEffect(() => {
    autoSaveTimersRef.current.forEach((t) => clearTimeout(t));
    autoSaveTimersRef.current.clear();

    if (filesSettings.autoSave === "afterDelay") {
      const delay = Math.max(200, filesSettings.autoSaveDelay || 1000);
      const dirtyDocs = (documentsRef.current || []).filter(
        (d) => d && d.isDirty && !d.isBinary && !d.readonly
      );
      for (const doc of dirtyDocs) {
        const timer = setTimeout(() => {
          autoSaveTimersRef.current.delete(doc.id);
          const current = documentsRef.current.find((d) => d.id === doc.id);
          if (current && current.isDirty && saveDocumentRef.current) {
            saveDocumentRef.current(doc.id);
          }
        }, delay);
        autoSaveTimersRef.current.set(doc.id, timer);
      }
    }
  }, [filesSettings.autoSave, filesSettings.autoSaveDelay]);

  const formatActiveDocument = useCallback(async (): Promise<boolean> => {
    const targetEditor =
      paneFocusStateRef.current.editors[focusedPaneRef.current] || monacoEditorRef.current;
    if (targetEditor) {
      return await FormatterService.formatMonacoDocument(targetEditor);
    }
    return false;
  }, []);

  const confirmDirtyClose = useCallback(
    async (action: DirtyCloseConfirmAction) => {
      const candidate = dirtyCloseCandidate;
      if (!candidate) return;

      if (action === "save") {
        await saveDocument(candidate.path);
        await closeDocument(candidate.path, true);
      } else if (action === "discard") {
        await closeDocument(candidate.path, true);
      }
      setDirtyCloseCandidate(null);
    },
    [dirtyCloseCandidate, saveDocument, closeDocument]
  );

  const revealInExplorer = useCallback((filePath: string) => {
    ideEvents.emit("editor:reveal-in-explorer", { path: normalizePath(filePath) });
  }, []);

  const clearBufferConflict = useCallback((filePath: string) => {
    const norm = normalizePath(filePath);
    setBufferConflicts((prev) => {
      if (!(norm in prev)) return prev;
      const next = { ...prev };
      delete next[norm];
      return next;
    });
  }, []);

  // Connect BufferSyncService bridge outside render so sync operations stay aligned with EditorContext.documents
  useEffect(() => {
    return BufferSyncService.connectEditorBridge({
      getDocuments: () => documentsRef.current,
      applySyncToDocument: (filePath, newContent, options) => {
        const norm = normalizePath(filePath);
        documentsRef.current = documentsRef.current.map((doc) => {
          if (doc.id !== norm) return doc;
          const savedContent = options.saved ? newContent : doc.savedContent;
          return {
            ...doc,
            content: newContent,
            savedContent,
            isDirty: options.saved ? false : newContent !== savedContent,
            error: null,
          };
        });
        setDocuments((prev) =>
          prev.map((doc) => {
            if (doc.id !== norm) return doc;
            const savedContent = options.saved ? newContent : doc.savedContent;
            return {
              ...doc,
              content: newContent,
              savedContent,
              isDirty: options.saved ? false : newContent !== savedContent,
              error: null,
            };
          })
        );
      },
      reportConflict: (conflict) => {
        const norm = normalizePath(conflict.path);
        setBufferConflicts((prev) => ({
          ...prev,
          [norm]: conflict,
        }));
      },
      clearConflict: (filePath) => {
        clearBufferConflict(filePath);
      },
    });
  }, [clearBufferConflict]);

  // Event bus bindings for file open, rename, delete, search navigation
  useEffect(() => {
    const handlePathChange = (oldPath: string, newPath: string) => {
      const normOld = normalizePath(oldPath);
      const normNew = normalizePath(newPath);

      // Update Monaco model and viewstate tracking
      ModelService.renamePath(normOld, normNew);

      setDocuments((prev) =>
        prev.map((doc) => {
          if (doc.id === normOld) {
            return {
              ...doc,
              id: normNew,
              path: normNew,
              title: basename(normNew),
              language: doc.language,
            };
          }
          if (doc.id.startsWith(normOld + "/")) {
            const sub = doc.id.slice(normOld.length);
            const updated = normNew + sub;
            return {
              ...doc,
              id: updated,
              path: updated,
              title: basename(updated),
            };
          }
          return doc;
        })
      );

      if (activeDocumentIdRef.current === normOld) {
        setActiveDocumentIdState(normNew);
      } else if (activeDocumentIdRef.current?.startsWith(normOld + "/")) {
        setActiveDocumentIdState(normNew + activeDocumentIdRef.current.slice(normOld.length));
      }

      if (splitDocumentIdRef.current === normOld) {
        setSplitDocumentIdState(normNew);
      } else if (splitDocumentIdRef.current?.startsWith(normOld + "/")) {
        setSplitDocumentIdState(normNew + splitDocumentIdRef.current.slice(normOld.length));
      }
    };

    const unsubs = [
      ideEvents.on("file:open-requested", (payload) => {
        if (!payload.isDirectory) {
          openDocument(payload.path);
        }
      }),

      ideEvents.on("file:renamed", ({ oldPath, newPath }) => {
        handlePathChange(oldPath, newPath);
      }),

      ideEvents.on("file:moved", ({ sourcePath, destPath }) => {
        handlePathChange(sourcePath, destPath);
      }),

      ideEvents.on("file:deleted", ({ path }) => {
        closeDocuments([path], true);
      }),

      ideEvents.on("files:deleted", ({ paths }) => {
        closeDocuments(paths, true);
      }),

      ideEvents.on("file:content-changed", ({ path, content }) => {
        const norm = normalizePath(path);
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === norm
              ? {
                  ...doc,
                  content,
                  savedContent: content,
                  isDirty: false,
                  error: null,
                }
              : doc
          )
        );
        ModelService.updateContent(norm, content);
        ideEvents.emit("editor:document-changed", { path: norm, isDirty: false });
      }),

      ideEvents.on("search:navigate-to-match", async ({ path, line, column, matchLength }) => {
        await openDocument(path);
        if (monacoEditorRef.current) {
          monacoEditorRef.current.revealLineInCenter(line);
          monacoEditorRef.current.setPosition({ lineNumber: line, column });
          if (matchLength && matchLength > 0) {
            monacoEditorRef.current.setSelection({
              startLineNumber: line,
              startColumn: column,
              endLineNumber: line,
              endColumn: column + matchLength,
            });
          }
          monacoEditorRef.current.focus();
        }
      }),

      ideEvents.on("file:open-to-side", async (payload) => {
        if (!payload.isDirectory) {
          await openDocument(payload.path);
          openSplitView(payload.path);
        }
      }),

      ideEvents.on("workbench:open-file", () => {
        openFileDialog();
      }),

      ideEvents.on("workspace:opened", (payload) => {
        workspaceGenerationRef.current += 1;
        BufferSyncService.setWorkspaceScope(payload?.rootPath ?? null);
      }),

      ideEvents.on("workspace:closing", () => {
        workspaceGenerationRef.current += 1;
        BufferSyncService.setWorkspaceScope(null);
        cleanupEditor(true);
      }),

      ideEvents.on("workspace:closed", () => {
        workspaceGenerationRef.current += 1;
        BufferSyncService.setWorkspaceScope(null);
        cleanupEditor(true);
      }),

      ideEvents.on("workspace:switched", (payload) => {
        workspaceGenerationRef.current += 1;
        BufferSyncService.setWorkspaceScope(payload?.to?.rootPath ?? null);
        cleanupEditor(true);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [openDocument, openFileDialog, closeDocument, closeDocuments, closeAllDocuments, cleanupEditor, openSplitView]);

  // Auto-save on window blur
  useEffect(() => {
    const handleBlur = () => {
      const mode = filesSettingsRef.current.autoSave;
      if (mode === "onFocusChange" || mode === "onWindowChange" || mode === "afterDelay") {
        const dirtyDocs = (documentsRef.current || []).filter((d) => d && d.isDirty);
        for (const doc of dirtyDocs) {
          if (saveDocumentRef.current) {
            saveDocumentRef.current(doc.id);
          }
        }
      }
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // External file watcher notifications
  useEffect(() => {
    return fsWatcher.onEvent(async (event) => {
      const watchGen = workspaceGenerationRef.current;
      const normPath = normalizePath(event.path);
      const openDoc = documentsRef.current.find((d) => d.id === normPath);
      if (!openDoc) return;

      if (event.type === "modify") {
        try {
          const reloaded = await EditorService.loadDocument(normPath);
          if (workspaceGenerationRef.current !== watchGen) return;

          const latestDoc = documentsRef.current.find((d) => d.id === normPath);
          if (!latestDoc) return;

          if (!latestDoc.isDirty) {
            documentsRef.current = documentsRef.current.map((d) =>
              d.id === normPath ? { ...d, ...reloaded } : d
            );
            setDocuments((prev) =>
              prev.map((d) => (d.id === normPath ? { ...d, ...reloaded } : d))
            );
            if (ModelService.hasModel(normPath)) {
              ModelService.applyEdit(normPath, reloaded.content, true);
            }
            clearBufferConflict(normPath);
            ideEvents.emit("editor:document-changed", { path: normPath, isDirty: false });
          } else {
            const liveBuffer = BufferSyncService.getBufferContent(normPath) ?? latestDoc.content;
            const conflict = DiffService.detectConflict({
              path: normPath,
              baseContent: latestDoc.savedContent,
              currentBuffer: liveBuffer,
              currentDisk: reloaded.content,
              isDirty: true,
              fileExistsOnDisk: !reloaded.error,
              expectedToExist: true,
            });
            if (conflict) {
              setBufferConflicts((prev) => ({ ...prev, [normPath]: conflict }));
              ideEvents.emit("editor:buffer-conflict", {
                path: normPath,
                type: conflict.type,
                message: conflict.message,
              });
            }
          }
        } catch {
          // Ignore transient watcher read failures
        }
      } else if (event.type === "delete") {
        if (openDoc.isDirty) {
          const deletedConflict = DiffService.detectConflict({
            path: normPath,
            baseContent: openDoc.savedContent,
            currentBuffer: BufferSyncService.getBufferContent(normPath) ?? openDoc.content,
            isDirty: true,
            fileExistsOnDisk: false,
            expectedToExist: true,
          });
          if (deletedConflict) {
            setBufferConflicts((prev) => ({ ...prev, [normPath]: deletedConflict }));
            ideEvents.emit("editor:buffer-conflict", {
              path: normPath,
              type: deletedConflict.type,
              message: deletedConflict.message,
            });
          }
          return;
        }
        closeDocuments([normPath], true);
      }
    });
  }, [closeDocuments, clearBufferConflict]);

  const value = useMemo(
    () => ({
      documents,
      activeDocumentId,
      activeDocument,
      settings,
      filesSettings,
      dirtyCloseCandidate,
      isQuickOpenVisible,
      isGoToLineVisible,

      // Split view
      isSplit,
      splitDirection,
      splitLayoutMode,
      splitDocumentId,
      splitDocument,
      splitRatio,
      setSplitRatio,
      openSplitView,
      openSplitRight,
      openSplitDown,
      closeSplitView,
      toggleSplitView,
      toggleSplitOrientation,
      swapSplitDocuments,
      setSplitDocumentId,

      // Editor-only zoom
      editorZoomLevel,
      zoomIn,
      zoomOut,
      zoomReset,

      openDocument,
      openFileDialog,
      closeDocument,
      closeDocuments,
      closeAllDocuments,
      cleanupEditor,
      closeOtherDocuments,
      setActiveDocumentId,
      updateContent,
      saveDocument,
      saveAllDocuments,
      formatActiveDocument,
      confirmDirtyClose,
      updateSettings,
      revealInExplorer,
      setQuickOpenVisible,
      setGoToLineVisible,
      monacoEditorRef,
      focusedPane,
      registerPaneEditor,
      focusPane,

      focusedDocument,
      bufferConflicts,
      clearBufferConflict,
      handleCursorChange,
      setFocusedDocPath,
    }),
    [
      documents,
      activeDocumentId,
      activeDocument,
      settings,
      filesSettings,
      dirtyCloseCandidate,
      isQuickOpenVisible,
      isGoToLineVisible,
      isSplit,
      splitDirection,
      splitLayoutMode,
      splitDocumentId,
      splitDocument,
      splitRatio,
      setSplitRatio,
      openSplitView,
      openSplitRight,
      openSplitDown,
      closeSplitView,
      toggleSplitView,
      toggleSplitOrientation,
      swapSplitDocuments,
      setSplitDocumentId,
      editorZoomLevel,
      zoomIn,
      zoomOut,
      zoomReset,
      openDocument,
      openFileDialog,
      closeDocument,
      closeDocuments,
      closeAllDocuments,
      cleanupEditor,
      closeOtherDocuments,
      setActiveDocumentId,
      updateContent,
      saveDocument,
      saveAllDocuments,
      formatActiveDocument,
      confirmDirtyClose,
      updateSettings,
      revealInExplorer,
      setQuickOpenVisible,
      setGoToLineVisible,
      monacoEditorRef,
      focusedPane,
      registerPaneEditor,
      focusPane,
      focusedDocument,
      bufferConflicts,
      clearBufferConflict,
      handleCursorChange,
      setFocusedDocPath,
    ]
  );

  return (
    <EditorContext.Provider value={value}>
      <EditorCursorContext.Provider value={focusedCursorPos}>
        {children}
      </EditorCursorContext.Provider>
    </EditorContext.Provider>
  );
}

export function useEditorCursor() {
  return useContext(EditorCursorContext);
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}

