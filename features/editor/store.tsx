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
  thirdDocumentId: string | null;
  thirdDocument: EditorDocument | null;
  splitRatio: number;
  splitRatio2: number;
  setSplitRatio: (ratio: number) => void;
  setSplitRatio2: (ratio: number) => void;
  openSplitView: (filePath?: string, direction?: SplitDirection) => void;
  openSplitRight: (filePath?: string) => void;
  openSplitDown: (filePath?: string) => void;
  openThreeColumnSplit: (file1?: string, file2?: string) => void;
  closeSplitView: () => void;
  toggleSplitView: () => void;
  toggleSplitOrientation: () => void;
  swapSplitDocuments: () => void;
  setSplitRatioPreset: (preset: "equal" | "left-heavy" | "right-heavy") => void;
  setSplitDocumentId: (filePath: string) => void;
  setThirdDocumentId: (filePath: string) => void;

  // Editor-only zoom
  editorZoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  openDocument: (filePath: string, initialContent?: string) => Promise<EditorDocument>;
  openFileDialog: () => Promise<EditorDocument | null>;
  closeDocument: (filePath: string, force?: boolean) => Promise<boolean>;
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
  const [thirdDocumentId, setThirdDocumentIdState] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [splitRatio2, setSplitRatio2] = useState(0.67);

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

  const thirdDocumentIdRef = useRef(thirdDocumentId);
  useEffect(() => {
    thirdDocumentIdRef.current = thirdDocumentId;
  }, [thirdDocumentId]);

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

  const thirdDocument = useMemo(() => {
    if (!thirdDocumentId) return null;
    return documents.find((doc) => doc.id === thirdDocumentId) || null;
  }, [documents, thirdDocumentId]);

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

  const openThreeColumnSplit = useCallback((file1?: string, file2?: string) => {
    const active = activeDocumentIdRef.current || (documentsRef.current[0]?.id ?? null);
    const target1 = file1 ? normalizePath(file1) : (splitDocumentIdRef.current || active);
    const target2 = file2
      ? normalizePath(file2)
      : documentsRef.current.find((d) => d.id !== active && d.id !== target1)?.id || target1;

    if (active) {
      setSplitDirection("horizontal");
      setSplitLayoutMode("split-three");
      setSplitRatio(0.33);
      setSplitRatio2(0.67);
      if (target1) setSplitDocumentIdState(target1);
      if (target2) setThirdDocumentIdState(target2);
      setIsSplit(true);
    }
  }, []);

  const closeSplitView = useCallback(() => {
    setIsSplit(false);
    setSplitLayoutMode("single");
    setSplitDocumentIdState(null);
    setThirdDocumentIdState(null);
  }, []);

  const toggleSplitView = useCallback(() => {
    setIsSplit((prev) => {
      if (prev) {
        setSplitLayoutMode("single");
        setSplitDocumentIdState(null);
        setThirdDocumentIdState(null);
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

  const setSplitRatioPreset = useCallback((preset: "equal" | "left-heavy" | "right-heavy") => {
    setSplitLayoutMode((mode) => {
      if (mode === "split-three") {
        if (preset === "equal") {
          setSplitRatio(0.333);
          setSplitRatio2(0.666);
        } else if (preset === "left-heavy") {
          setSplitRatio(0.5);
          setSplitRatio2(0.75);
        } else if (preset === "right-heavy") {
          setSplitRatio(0.25);
          setSplitRatio2(0.5);
        }
      } else {
        if (preset === "equal") {
          setSplitRatio(0.5);
        } else if (preset === "left-heavy") {
          setSplitRatio(0.7);
        } else if (preset === "right-heavy") {
          setSplitRatio(0.3);
        }
      }
      return mode;
    });
  }, []);

  const setSplitDocumentId = useCallback((filePath: string) => {
    setSplitDocumentIdState(normalizePath(filePath));
  }, []);

  const setThirdDocumentId = useCallback((filePath: string) => {
    setThirdDocumentIdState(normalizePath(filePath));
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

        let contentToSave = doc.content;
        if (filesSettingsRef.current.trimTrailingWhitespace) {
          contentToSave = contentToSave
            .split("\n")
            .map((line) => line.replace(/\s+$/, ""))
            .join("\n");
        }
        if (filesSettingsRef.current.insertFinalNewline && !contentToSave.endsWith("\n")) {
          contentToSave += "\n";
        }

        await EditorService.saveDocument(doc.path, contentToSave);

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === targetId
              ? { ...d, content: contentToSave, savedContent: contentToSave, isDirty: false, error: null }
              : d
          )
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

  const openDocument = useCallback(
    async (filePath: string, initialContent?: string): Promise<EditorDocument> => {
      const norm = normalizePath(filePath);

      // Check if file is already open
      const existing = documentsRef.current.find((doc) => doc.id === norm);
      if (existing) {
        setActiveDocumentId(norm);
        return existing;
      }

      // Load document from disk
      const doc = await EditorService.loadDocument(norm, initialContent);

      setDocuments((prev) => {
        if (prev.some((d) => d.id === norm)) return prev;
        return [...prev, doc];
      });

      setActiveDocumentId(norm);
      ideEvents.emit("editor:document-opened", { path: norm });
      return doc;
    },
    [setActiveDocumentId]
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

      if (doc.isDirty && !force) {
        setDirtyCloseCandidate(doc);
        return false;
      }

      // Clear pending auto-save timer
      const pendingTimer = autoSaveTimersRef.current.get(norm);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        autoSaveTimersRef.current.delete(norm);
      }

      ModelService.disposeModel(norm);

      const remaining = documentsRef.current.filter((d) => d.id !== norm);
      setDocuments(remaining);

      // If closed active document, switch to adjacent
      if (activeDocumentIdRef.current === norm) {
        if (remaining.length > 0) {
          const closedIdx = documentsRef.current.findIndex((d) => d.id === norm);
          const nextIdx = Math.min(closedIdx, remaining.length - 1);
          setActiveDocumentId(remaining[nextIdx].id);
        } else {
          setActiveDocumentIdState(null);
          ideEvents.emit("editor:active-changed", { path: null });
        }
      }

      // If closed split document, reassign or close split
      if (splitDocumentIdRef.current === norm) {
        const remainingForSplit = remaining.filter((d) => d.id !== norm && d.id !== thirdDocumentIdRef.current);
        if (remainingForSplit.length > 0) {
          setSplitDocumentIdState(remainingForSplit[0].id);
        } else if (thirdDocumentIdRef.current) {
          setSplitDocumentIdState(thirdDocumentIdRef.current);
          setThirdDocumentIdState(null);
          setSplitLayoutMode("split-right");
        } else {
          setIsSplit(false);
          setSplitLayoutMode("single");
          setSplitDocumentIdState(null);
        }
      }

      // If closed third document, degrade to 2-pane split
      if (thirdDocumentIdRef.current === norm) {
        setThirdDocumentIdState(null);
        setSplitLayoutMode((mode) => (mode === "split-three" ? "split-right" : mode));
      }

      ideEvents.emit("editor:document-closed", { path: norm });
      return true;
    },
    [setActiveDocumentId]
  );

  const closeAllDocuments = useCallback(async (): Promise<boolean> => {
    const dirtyDocs = documentsRef.current.filter((d) => d.isDirty);
    if (dirtyDocs.length > 0) {
      setDirtyCloseCandidate(dirtyDocs[0]);
      return false;
    }

    autoSaveTimersRef.current.forEach((t) => clearTimeout(t));
    autoSaveTimersRef.current.clear();

    ModelService.disposeAll();
    setDocuments([]);
    setActiveDocumentIdState(null);
    closeSplitView();
    ideEvents.emit("editor:active-changed", { path: null });
    return true;
  }, [closeSplitView]);

  const closeOtherDocuments = useCallback(
    async (filePath: string): Promise<boolean> => {
      const norm = normalizePath(filePath);
      const others = documentsRef.current.filter((d) => d.id !== norm);
      const dirtyOther = others.find((d) => d.isDirty);

      if (dirtyOther) {
        setDirtyCloseCandidate(dirtyOther);
        return false;
      }

      others.forEach((d) => {
        const pendingTimer = autoSaveTimersRef.current.get(d.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          autoSaveTimersRef.current.delete(d.id);
        }
        ModelService.disposeModel(d.id);
      });

      setDocuments(documentsRef.current.filter((d) => d.id === norm));
      setActiveDocumentId(norm);
      if (splitDocumentIdRef.current && splitDocumentIdRef.current !== norm) {
        closeSplitView();
      }
      return true;
    },
    [setActiveDocumentId, closeSplitView]
  );

  const updateContent = useCallback((filePath: string, newContent: string) => {
    const norm = normalizePath(filePath);

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

      if (thirdDocumentIdRef.current === normOld) {
        setThirdDocumentIdState(normNew);
      } else if (thirdDocumentIdRef.current?.startsWith(normOld + "/")) {
        setThirdDocumentIdState(normNew + thirdDocumentIdRef.current.slice(normOld.length));
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
        const norm = normalizePath(path);
        ModelService.disposePath(norm);
        const docsToClose = documentsRef.current.filter(
          (doc) => doc.id === norm || doc.id.startsWith(norm + "/")
        );
        for (const d of docsToClose) {
          closeDocument(d.id, true);
        }
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
  }, [openDocument, openFileDialog, closeDocument, closeAllDocuments, openSplitView]);

  // Auto-save on window blur
  useEffect(() => {
    const handleBlur = () => {
      const mode = filesSettingsRef.current.autoSave;
      if (mode === "onFocusChange" || mode === "onWindowChange" || mode === "afterDelay") {
        const dirtyDocs = documentsRef.current.filter((d) => d.isDirty);
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
            setDocuments((prev) =>
              prev.map((d) => (d.id === normPath ? { ...d, ...reloaded } : d))
            );
          } catch {
            // Ignore
          }
        }
      } else if (event.type === "delete") {
        closeDocument(normPath, true);
      }
    });
  }, [closeDocument]);

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
      thirdDocumentId,
      thirdDocument,
      splitRatio,
      splitRatio2,
      setSplitRatio,
      setSplitRatio2,
      openSplitView,
      openSplitRight,
      openSplitDown,
      openThreeColumnSplit,
      closeSplitView,
      toggleSplitView,
      toggleSplitOrientation,
      swapSplitDocuments,
      setSplitRatioPreset,
      setSplitDocumentId,
      setThirdDocumentId,

      // Editor-only zoom
      editorZoomLevel,
      zoomIn,
      zoomOut,
      zoomReset,

      openDocument,
      openFileDialog,
      closeDocument,
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
      thirdDocumentId,
      thirdDocument,
      splitRatio,
      splitRatio2,
      setSplitRatio,
      openSplitView,
      openSplitRight,
      openSplitDown,
      openThreeColumnSplit,
      closeSplitView,
      toggleSplitView,
      toggleSplitOrientation,
      swapSplitDocuments,
      setSplitRatioPreset,
      setSplitDocumentId,
      setThirdDocumentId,
      editorZoomLevel,
      zoomIn,
      zoomOut,
      zoomReset,
      openDocument,
      openFileDialog,
      closeDocument,
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

