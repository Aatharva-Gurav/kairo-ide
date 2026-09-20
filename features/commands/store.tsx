"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { CommandRegistry } from "./command-registry";
import { KeybindingService } from "./keybinding.service";
import { useWorkspace } from "@/features/workspace/store";
import { useFileExplorer } from "@/features/file-explorer/store";
import { useEditor } from "@/features/editor/store";
import { useSettings } from "@/features/settings/store";
import { useSidebar } from "@/components/ui/sidebar";
import { CommandPaletteModal } from "@/features/command-palette/components/command-palette-modal";
import { QuickOpenModal } from "@/features/editor/components/quick-open-modal";
import { SettingsModal } from "@/features/settings/components/settings-modal";
import { ideEvents } from "@/lib/events";
import { isTauriEnvironment, invokeCommand, writeFileContent } from "@/lib/tauri-ipc";
import { WorkspaceService } from "@/features/workspace/service";

export interface CommandContextValue {
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: (initialQuery?: string) => void;
  closeCommandPalette: () => void;

  isQuickOpenOpen: boolean;
  setQuickOpenOpen: (open: boolean) => void;
  openQuickOpen: () => void;
  closeQuickOpen: () => void;

  executeCommand: (id: string) => Promise<boolean>;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
  const [isQuickOpenOpen, setQuickOpenOpen] = useState(false);

  // Subsystem hooks
  const { activeWorkspace, openFolder, closeWorkspace, openWorkspacePath } = useWorkspace();
  const fileExplorer = useFileExplorer();
  const editor = useEditor();
  const { openSettings, updateSetting, settings } = useSettings();
  const { toggleSidebar } = useSidebar();

  // Keep references to prevent stale closures in registered commands
  const workspaceRef = useRef({ activeWorkspace, openFolder, closeWorkspace, openWorkspacePath });
  useEffect(() => {
    workspaceRef.current = { activeWorkspace, openFolder, closeWorkspace, openWorkspacePath };
  }, [activeWorkspace, openFolder, closeWorkspace, openWorkspacePath]);

  const explorerRef = useRef(fileExplorer);
  useEffect(() => {
    explorerRef.current = fileExplorer;
  }, [fileExplorer]);

  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const settingsRef = useRef({ openSettings, updateSetting, settings });
  useEffect(() => {
    settingsRef.current = { openSettings, updateSetting, settings };
  }, [openSettings, updateSetting, settings]);

  const sidebarRef = useRef({ toggleSidebar });
  useEffect(() => {
    sidebarRef.current = { toggleSidebar };
  }, [toggleSidebar]);

  // Modal open helpers
  const openCommandPalette = useCallback((initialQuery = "") => {
    setPaletteInitialQuery(initialQuery);
    setQuickOpenOpen(false);
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const openQuickOpen = useCallback(() => {
    setCommandPaletteOpen(false);
    setQuickOpenOpen(true);
  }, []);

  const closeQuickOpen = useCallback(() => {
    setQuickOpenOpen(false);
  }, []);

  // Initialize KeybindingService
  useEffect(() => {
    KeybindingService.init();
  }, []);

  // Register all core IDE commands
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // ─── WORKBENCH COMMANDS ────────────────────────────────────────────────
    unsubs.push(
      CommandRegistry.register({
        id: "workbench.openFolder",
        title: "Open Folder...",
        description: "Open a folder workspace from the local filesystem",
        category: "workbench",
        keywords: ["open", "project", "folder", "workspace"],
        execute: async () => {
          await workspaceRef.current.openFolder();
        },
      }),

      CommandRegistry.register({
        id: "workbench.closeWorkspace",
        title: "Close Workspace",
        description: "Close the currently active folder workspace",
        category: "workbench",
        keywords: ["close", "exit", "workspace"],
        enabled: () => Boolean(workspaceRef.current.activeWorkspace),
        execute: () => {
          workspaceRef.current.closeWorkspace();
        },
      }),

      CommandRegistry.register({
        id: "workbench.toggleSidebar",
        title: "Toggle Primary Sidebar",
        description: "Show or hide the primary sidebar",
        category: "workbench",
        keywords: ["sidebar", "view", "toggle", "hide"],
        execute: () => {
          sidebarRef.current.toggleSidebar();
        },
      }),

      CommandRegistry.register({
        id: "workbench.commandPalette",
        title: "Command Palette...",
        description: "Open the command palette to search and run commands",
        category: "workbench",
        keywords: ["command", "palette", "action"],
        execute: () => {
          openCommandPalette();
        },
      }),

      CommandRegistry.register({
        id: "workbench.quickOpen",
        title: "Quick Open (Go to File)...",
        description: "Quickly find and open files by name in the active workspace",
        category: "workbench",
        keywords: ["file", "quick", "open", "find"],
        execute: () => {
          openQuickOpen();
        },
      }),

      CommandRegistry.register({
        id: "workbench.openSettings",
        title: "Preferences: Open Settings",
        description: "Open IDE configuration and settings editor",
        category: "settings",
        keywords: ["settings", "preferences", "config", "options"],
        execute: () => {
          settingsRef.current.openSettings();
        },
      }),

      CommandRegistry.register({
        id: "workbench.openKeyboardShortcuts",
        title: "Preferences: Open Keyboard Shortcuts",
        description: "Customize and view keyboard shortcuts",
        category: "settings",
        keywords: ["keyboard", "shortcuts", "keybindings", "keys"],
        execute: () => {
          settingsRef.current.openSettings("shortcuts");
        },
      })
    );

    // ─── EXPLORER COMMANDS ─────────────────────────────────────────────────
    unsubs.push(
      CommandRegistry.register({
        id: "explorer.newFile",
        title: "Explorer: New File",
        description: "Create a new file in the explorer",
        category: "explorer",
        keywords: ["create", "file", "new"],
        enabled: () => Boolean(workspaceRef.current.activeWorkspace),
        execute: () => {
          explorerRef.current.startCreateFile();
        },
      }),

      CommandRegistry.register({
        id: "explorer.newFolder",
        title: "Explorer: New Folder",
        description: "Create a new directory in the explorer",
        category: "explorer",
        keywords: ["create", "folder", "directory", "new"],
        enabled: () => Boolean(workspaceRef.current.activeWorkspace),
        execute: () => {
          explorerRef.current.startCreateFolder();
        },
      }),

      CommandRegistry.register({
        id: "explorer.refresh",
        title: "Explorer: Refresh",
        description: "Reload directory entries from disk",
        category: "explorer",
        keywords: ["refresh", "reload", "explorer"],
        enabled: () => Boolean(workspaceRef.current.activeWorkspace),
        execute: async () => {
          await explorerRef.current.refresh();
        },
      }),

      CommandRegistry.register({
        id: "explorer.collapseAll",
        title: "Explorer: Collapse All Folders",
        description: "Collapse all open folders in the file tree",
        category: "explorer",
        keywords: ["collapse", "folders", "tree"],
        enabled: () => Boolean(workspaceRef.current.activeWorkspace),
        execute: () => {
          explorerRef.current.collapseAll();
        },
      }),

      CommandRegistry.register({
        id: "explorer.toggleHidden",
        title: "Explorer: Toggle Hidden Files",
        description: "Toggle visibility of hidden dotfiles in the tree",
        category: "explorer",
        keywords: ["hidden", "dotfiles", "files"],
        execute: () => {
          const current = explorerRef.current.showHidden;
          explorerRef.current.setShowHidden(!current);
          settingsRef.current.updateSetting("explorer.showHidden", !current);
        },
      })
    );

    // ─── EDITOR COMMANDS ───────────────────────────────────────────────────
    unsubs.push(
      CommandRegistry.register({
        id: "editor.save",
        title: "File: Save",
        description: "Save active document to disk",
        category: "editor",
        keywords: ["save", "write", "disk"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: async () => {
          await editorRef.current.saveDocument();
        },
      }),

      CommandRegistry.register({
        id: "editor.saveAll",
        title: "File: Save All",
        description: "Save all modified documents to disk",
        category: "editor",
        keywords: ["save", "all", "dirty"],
        enabled: () => editorRef.current.documents.length > 0,
        execute: async () => {
          await editorRef.current.saveAllDocuments();
        },
      }),

      CommandRegistry.register({
        id: "editor.close",
        title: "View: Close Active Editor Tab",
        description: "Close current open file tab",
        category: "editor",
        keywords: ["close", "tab", "file"],
        enabled: () => Boolean(editorRef.current.activeDocumentId),
        execute: async () => {
          if (editorRef.current.activeDocumentId) {
            await editorRef.current.closeDocument(editorRef.current.activeDocumentId);
          }
        },
      }),

      CommandRegistry.register({
        id: "editor.closeAll",
        title: "View: Close All Editor Tabs",
        description: "Close all open file tabs",
        category: "editor",
        keywords: ["close", "all", "tabs"],
        enabled: () => editorRef.current.documents.length > 0,
        execute: async () => {
          await editorRef.current.closeAllDocuments();
        },
      }),

      CommandRegistry.register({
        id: "editor.closeOthers",
        title: "View: Close Other Editor Tabs",
        description: "Close all file tabs except active document",
        category: "editor",
        keywords: ["close", "other", "tabs"],
        enabled: () => editorRef.current.documents.length > 1,
        execute: async () => {
          if (editorRef.current.activeDocumentId) {
            await editorRef.current.closeOtherDocuments(editorRef.current.activeDocumentId);
          }
        },
      }),

      CommandRegistry.register({
        id: "editor.formatDocument",
        title: "Format Document",
        description: "Format active document using registered language formatter",
        category: "editor",
        keywords: ["format", "prettier", "indent", "beautify"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: async () => {
          await editorRef.current.formatActiveDocument();
        },
      }),

      CommandRegistry.register({
        id: "editor.goToLine",
        title: "Go to Line / Column...",
        description: "Jump to a specific line and column in the active editor",
        category: "navigation",
        keywords: ["line", "jump", "go", "navigate"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: () => {
          editorRef.current.setGoToLineVisible(true);
        },
      }),

      CommandRegistry.register({
        id: "editor.goToDefinition",
        title: "Go to Definition",
        description: "Navigate to symbol definition",
        category: "navigation",
        keywords: ["definition", "symbol", "f12"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: () => {
          const ed = editorRef.current.monacoEditorRef.current;
          if (ed) {
            ed.trigger("keyboard", "editor.action.revealDefinition", null);
          }
        },
      }),

      CommandRegistry.register({
        id: "editor.peekDefinition",
        title: "Peek Definition",
        description: "Open inline preview of symbol definition",
        category: "navigation",
        keywords: ["peek", "definition", "symbol"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: () => {
          const ed = editorRef.current.monacoEditorRef.current;
          if (ed) {
            ed.trigger("keyboard", "editor.action.peekDefinition", null);
          }
        },
      }),

      CommandRegistry.register({
        id: "workbench.action.splitEditor",
        title: "View: Split Editor Right",
        description: "Split editor pane side-by-side",
        category: "view",
        keywords: ["split", "pane", "side", "view"],
        enabled: () => Boolean(editorRef.current.activeDocument),
        execute: () => {
          editorRef.current.toggleSplitView();
        },
      }),

      CommandRegistry.register({
        id: "editor.zoomIn",
        title: "View: Zoom In Editor",
        description: "Increase Monaco editor font size",
        category: "view",
        keywords: ["zoom", "in", "font", "larger"],
        execute: () => {
          editorRef.current.zoomIn();
        },
      }),

      CommandRegistry.register({
        id: "editor.zoomOut",
        title: "View: Zoom Out Editor",
        description: "Decrease Monaco editor font size",
        category: "view",
        keywords: ["zoom", "out", "font", "smaller"],
        execute: () => {
          editorRef.current.zoomOut();
        },
      }),

      CommandRegistry.register({
        id: "editor.zoomReset",
        title: "View: Reset Editor Zoom",
        description: "Reset Monaco editor font size to 100%",
        category: "view",
        keywords: ["zoom", "reset", "normal"],
        execute: () => {
          editorRef.current.zoomReset();
        },
      })
    );

    // ─── SEARCH COMMANDS ───────────────────────────────────────────────────
    unsubs.push(
      CommandRegistry.register({
        id: "search.findInWorkspace",
        title: "Search: Find in Workspace Files",
        description: "Open workspace search view and find text in files",
        category: "search",
        keywords: ["search", "find", "grep", "workspace"],
        execute: () => {
          ideEvents.emit("sidebar:switch-tab", "search");
        },
      })
    );

    // ─── VIEW COMMANDS ─────────────────────────────────────────────────────
    unsubs.push(
      CommandRegistry.register({
        id: "view.toggleTheme",
        title: "Preferences: Toggle Light / Dark Theme",
        description: "Toggle workbench and editor theme between light and dark",
        category: "view",
        keywords: ["theme", "color", "dark", "light"],
        execute: () => {
          const current = settingsRef.current.settings.appearance.theme;
          const next = current === "dark" ? "light" : "dark";
          settingsRef.current.updateSetting("appearance.theme", next);
        },
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [openCommandPalette, openQuickOpen]);

  // Global Keydown Dispatcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing inside an input or textarea
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const rawKey = KeybindingService.normalizeKeyboardEvent(e);
      if (!rawKey) return;

      const commandId = KeybindingService.getCommandIdForKeybinding(rawKey);
      if (!commandId) return;

      // Accelerators that should work even inside inputs:
      // Ctrl+S, Ctrl+Shift+S, Ctrl+P, Ctrl+Shift+P, Ctrl+B, Ctrl+,
      const isGlobalAccelerator = [
        "workbench.commandPalette",
        "workbench.quickOpen",
        "workbench.openSettings",
        "workbench.toggleSidebar",
        "editor.save",
        "editor.saveAll",
      ].includes(commandId);

      if (isTextInput && !isGlobalAccelerator) {
        return;
      }

      if (CommandRegistry.isEnabled(commandId)) {
        e.preventDefault();
        e.stopPropagation();
        CommandRegistry.execute(commandId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Synchronize recent workspaces with native Tauri menu
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const recents = WorkspaceService.getRecentWorkspaces();
    invokeCommand("menu_sync_recent_workspaces", {
      paths: recents.map((r) => r.rootPath),
    }).catch(() => {});
  }, [activeWorkspace]);

  // Native Tauri Menu Event Listener
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ id: string; payload?: string }>("menu:action", async (event) => {
        const { id, payload } = event.payload;

        switch (id) {
          case "file.new": {
            if (workspaceRef.current.activeWorkspace) {
              explorerRef.current.startCreateFile();
            } else {
              editorRef.current.openDocument("untitled-1.txt").catch(() => {});
            }
            break;
          }
          case "file.open": {
            try {
              const picked = await invokeCommand<string | null>("workspace_pick_file");
              if (picked) {
                await editorRef.current.openDocument(picked);
              }
            } catch (err) {
              console.error("[NativeMenu] Failed to open file:", err);
            }
            break;
          }
          case "file.openFolder": {
            await workspaceRef.current.openFolder();
            break;
          }
          case "file.openRecent": {
            if (payload) {
              await workspaceRef.current.openWorkspacePath(payload);
            }
            break;
          }
          case "file.clearRecent": {
            WorkspaceService.clearRecentWorkspaces();
            invokeCommand("menu_sync_recent_workspaces", { paths: [] }).catch(() => {});
            break;
          }
          case "file.save": {
            await editorRef.current.saveDocument();
            break;
          }
          case "file.saveAs": {
            const doc = editorRef.current.activeDocument;
            if (!doc) break;
            try {
              const targetPath = await invokeCommand<string | null>("workspace_save_file_as", {
                defaultPath: doc.path,
              });
              if (targetPath) {
                await writeFileContent(targetPath, doc.content);
                await editorRef.current.openDocument(targetPath);
              }
            } catch (err) {
              console.error("[NativeMenu] Failed to Save As:", err);
            }
            break;
          }
          case "file.saveAll": {
            await editorRef.current.saveAllDocuments();
            break;
          }
          case "file.closeEditor": {
            if (editorRef.current.activeDocumentId) {
              await editorRef.current.closeDocument(editorRef.current.activeDocumentId);
            }
            break;
          }
          case "edit.undo": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "undo", null);
            } else {
              document.execCommand("undo");
            }
            break;
          }
          case "edit.redo": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "redo", null);
            } else {
              document.execCommand("redo");
            }
            break;
          }
          case "edit.cut": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "editor.action.clipboardCutAction", null);
            } else {
              document.execCommand("cut");
            }
            break;
          }
          case "edit.copy": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "editor.action.clipboardCopyAction", null);
            } else {
              document.execCommand("copy");
            }
            break;
          }
          case "edit.paste": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "editor.action.clipboardPasteAction", null);
            } else {
              document.execCommand("paste");
            }
            break;
          }
          case "edit.selectAll":
          case "selection.selectAll": {
            const monaco = editorRef.current.monacoEditorRef.current;
            if (monaco) {
              monaco.trigger("nativeMenu", "editor.action.selectAll", null);
            } else {
              document.execCommand("selectAll");
            }
            break;
          }
          case "selection.expand": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.smartSelect.expand",
              null
            );
            break;
          }
          case "selection.shrink": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.smartSelect.shrink",
              null
            );
            break;
          }
          case "selection.copyLineUp": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.copyLinesUpAction",
              null
            );
            break;
          }
          case "selection.copyLineDown": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.copyLinesDownAction",
              null
            );
            break;
          }
          case "selection.moveLineUp": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.moveLinesUpAction",
              null
            );
            break;
          }
          case "selection.moveLineDown": {
            editorRef.current.monacoEditorRef.current?.trigger(
              "nativeMenu",
              "editor.action.moveLinesDownAction",
              null
            );
            break;
          }
          case "view.commandPalette": {
            openCommandPalette();
            break;
          }
          case "view.editorLayout.splitRight": {
            editorRef.current.toggleSplitView();
            break;
          }
          case "view.explorer": {
            ideEvents.emit("sidebar:switch-tab", "explorer");
            break;
          }
          case "view.search": {
            ideEvents.emit("sidebar:switch-tab", "search");
            break;
          }
          case "help.welcome": {
            if (workspaceRef.current.activeWorkspace) {
              workspaceRef.current.closeWorkspace();
            }
            break;
          }
          case "help.keyboardShortcuts": {
            settingsRef.current.openSettings("shortcuts");
            break;
          }
          default:
            break;
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [openCommandPalette]);

  const executeCommand = useCallback(async (id: string): Promise<boolean> => {
    return await CommandRegistry.execute(id);
  }, []);

  const value = useMemo<CommandContextValue>(
    () => ({
      isCommandPaletteOpen,
      setCommandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      isQuickOpenOpen,
      setQuickOpenOpen,
      openQuickOpen,
      closeQuickOpen,
      executeCommand,
    }),
    [
      isCommandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      isQuickOpenOpen,
      openQuickOpen,
      closeQuickOpen,
      executeCommand,
    ]
  );

  return (
    <CommandContext.Provider value={value}>
      {children}

      {/* Global Command Palette */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={closeCommandPalette}
        initialQuery={paletteInitialQuery}
      />

      {/* Global Quick Open */}
      <QuickOpenModal
        isOpen={isQuickOpenOpen}
        onClose={closeQuickOpen}
        onSwitchToCommandPalette={openCommandPalette}
      />

      {/* Master Settings Dialog */}
      <SettingsModal />
    </CommandContext.Provider>
  );
}

export function useCommands(): CommandContextValue {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("useCommands must be used within a CommandProvider");
  }
  return context;
}
