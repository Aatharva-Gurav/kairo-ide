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
import { ideEvents } from "@/lib/events";
import { normalizePath, basename, isTauriEnvironment, invokeCommand } from "@/lib/tauri-ipc";
import { fsWatcher } from "@/lib/watcher";

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
}

const EditorContext = createContext<EditorContextValue | null>(null);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoEditorRef = useRef<any>(null);
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
  }, []);

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
        if (settings.formatOnSave && monacoEditorRef.current) {
          await FormatterService.formatMonacoDocument(monacoEditorRef.current);
        }

        // Always prioritize the active Monaco model's live content if available
        const activeModel = ModelService.getModel(targetId);
        let contentToSave = activeModel ? activeModel.getValue() : doc.content;

        if (filesSettingsRef.current.trimTrailingWhitespace) {
          contentToSave = contentToSave
            .split("\n")
            .map((line: string) => line.replace(/\s+$/, ""))
            .join("\n");
        }
        if (filesSettingsRef.current.insertFinalNewline && !contentToSave.endsWith("\n")) {
          contentToSave += "\n";
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
      if (mode === "onFocusChange" || mode === "onWindowChange") {
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
        } else {
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
      } else {
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
        } else {
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
    const { saved, failed } = await EditorService.saveAllDocuments(documentsRef.current);

    if (saved.length > 0) {
      setDocuments((prev) =>
        prev.map((doc) =>
          saved.includes(doc.path)
            ? { ...doc, savedContent: doc.content, isDirty: false, error: null }
            : doc
        )
      );

      saved.forEach((p) => {
        ideEvents.emit("editor:document-saved", { path: p });
        ideEvents.emit("editor:document-changed", { path: p, isDirty: false });
      });
    }

    if (failed.length > 0) {
      setDocuments((prev) =>
        prev.map((doc) => {
          const fail = failed.find((f) => f.path === doc.path);
          return fail ? { ...doc, error: fail.error } : doc;
        })
      );
      return false;
    }

    return true;
  }, []);

  const formatActiveDocument = useCallback(async (): Promise<boolean> => {
    if (monacoEditorRef.current) {
      return await FormatterService.formatMonacoDocument(monacoEditorRef.current);
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

      ideEvents.on("workspace:closed", () => {
        closeAllDocuments();
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [openDocument, openFileDialog, closeDocument, closeDocuments, closeAllDocuments, openSplitView]);

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

  // Split view shortcuts:
  // - Ctrl+\ (Cmd+\ on macOS): Toggle split right / close split
  // - Ctrl+K then Ctrl+\: Split down
  useEffect(() => {
    let ctrlKActive = false;
    let ctrlKTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isCtrlOrMeta && (e.key === "k" || e.key === "K")) {
        ctrlKActive = true;
        if (ctrlKTimeout) clearTimeout(ctrlKTimeout);
        ctrlKTimeout = setTimeout(() => {
          ctrlKActive = false;
        }, 1200);
        return;
      }

      if (isCtrlOrMeta && e.key === "\\") {
        e.preventDefault();
        if (ctrlKActive) {
          ctrlKActive = false;
          if (ctrlKTimeout) clearTimeout(ctrlKTimeout);
          openSplitDown();
        } else {
          toggleSplitView();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (ctrlKTimeout) clearTimeout(ctrlKTimeout);
    };
  }, [toggleSplitView, openSplitDown]);

  // External file watcher notifications
  useEffect(() => {
    return fsWatcher.onEvent(async (event) => {
      const normPath = normalizePath(event.path);
      const openDoc = documentsRef.current.find((d) => d.id === normPath);
      if (!openDoc) return;

      if (event.type === "modify") {
        if (!openDoc.isDirty) {
          // Clean reload from disk
          try {
            const reloaded = await EditorService.loadDocument(normPath);
            documentsRef.current = documentsRef.current.map((d) =>
              d.id === normPath ? { ...d, ...reloaded } : d
            );
            setDocuments((prev) =>
              prev.map((d) => (d.id === normPath ? { ...d, ...reloaded } : d))
            );
            ModelService.updateContent(normPath, reloaded.content);
            ideEvents.emit("editor:document-changed", { path: normPath, isDirty: false });
          } catch {
            // Ignore
          }
        }
      } else if (event.type === "delete") {
        closeDocuments([normPath], true);
      }
    });
  }, [closeDocuments]);

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
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}

