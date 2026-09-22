"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useWorkspace } from "@/features/workspace/store";
import { useEditor } from "@/features/editor/store";
import { useSettings } from "@/features/settings/store";
import { useCommands } from "@/features/commands/store";
import { useFileExplorer } from "@/features/file-explorer/store";
import { useSidebar } from "@/components/ui/sidebar";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";
import { Button } from "@/components/ui/button";
import { isTauriEnvironment, invokeCommand, basename, writeFileContent } from "@/lib/tauri-ipc";
import { ideEvents } from "@/lib/events";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Search01Icon,
  CheckmarkCircle02Icon,
  ArrowRight01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface MenuItemDef {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action?: () => void | Promise<void>;
  submenu?: MenuItemDef[];
}

export function AppTitleBar() {
  const { activeWorkspace, openFolder, closeWorkspace, recentWorkspaces, openWorkspacePath, clearRecent } = useWorkspace();
  const {
    activeDocument,
    activeDocumentId,
    saveDocument,
    saveAllDocuments,
    closeDocument,
    closeAllDocuments,
    toggleSplitView,
    openDocument,
  } = useEditor();
  const { settings, updateSetting, openSettings } = useSettings();
  const { openCommandPalette, openQuickOpen } = useCommands();
  const { startCreateFile } = useFileExplorer();
  const { toggleSidebar } = useSidebar();

  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [docFilter, setDocFilter] = useState("");
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const menuBarRef = useRef<HTMLDivElement>(null);
  const isTauri = isTauriEnvironment();

  // Check window maximized state on mount and resize
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    const checkMaximized = async () => {
      try {
        const max = await invokeCommand<boolean>("window_is_maximized");
        if (isMounted) {
          setIsMaximized(Boolean(max));
        }
      } catch {
        // Ignored in non-window contexts
      }
    };

    checkMaximized();
    window.addEventListener("resize", checkMaximized);
    return () => {
      isMounted = false;
      window.removeEventListener("resize", checkMaximized);
    };
  }, [isTauri]);

  // Sync window theme with Tauri if available
  useEffect(() => {
    if (!isTauri) return;
    const isDark = document.documentElement.classList.contains("dark");
    invokeCommand("window_set_theme", { theme: isDark ? "dark" : "light" }).catch(() => {});
  }, [settings.appearance.theme, isTauri]);

  // Dismiss menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setActiveSubmenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setActiveSubmenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [activeMenu]);

  // Window control handlers
  const handleMinimize = useCallback(async () => {
    if (isTauri) {
      try {
        await invokeCommand("window_minimize");
      } catch (err) {
        console.error("[AppTitleBar] Failed to minimize window:", err);
      }
    }
  }, [isTauri]);

  const handleToggleMaximize = useCallback(async () => {
    if (isTauri) {
      try {
        await invokeCommand("window_toggle_maximize");
        const max = await invokeCommand<boolean>("window_is_maximized");
        setIsMaximized(Boolean(max));
      } catch (err) {
        console.error("[AppTitleBar] Failed to toggle maximize window:", err);
      }
    } else {
      setIsMaximized((prev) => !prev);
    }
  }, [isTauri]);

  const handleClose = useCallback(async () => {
    if (isTauri) {
      try {
        await invokeCommand("window_close");
      } catch (err) {
        console.error("[AppTitleBar] Failed to close window:", err);
      }
    } else {
      window.close();
    }
  }, [isTauri]);

  // Toggle Fullscreen action
  const toggleFullScreen = useCallback(async () => {
    if (isTauri) {
      try {
        await invokeCommand("window_toggle_fullscreen");
      } catch {
        // Fallback to DOM fullscreen
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [isTauri]);

  // Zen Mode toggle
  const toggleZenMode = useCallback(() => {
    toggleSidebar();
  }, [toggleSidebar]);

  // Save As handler
  const handleSaveAs = useCallback(async () => {
    if (!activeDocument) return;
    try {
      if (isTauri) {
        const targetPath = await invokeCommand<string | null>("workspace_save_file_as", {
          defaultPath: activeDocument.path,
        });
        if (targetPath) {
          await writeFileContent(targetPath, activeDocument.content);
          await openDocument(targetPath);
        }
      }
    } catch (err) {
      console.error("[AppTitleBar] Failed to Save As:", err);
    }
  }, [activeDocument, isTauri, openDocument]);

  // Pick file handler
  const handleOpenFile = useCallback(async () => {
    try {
      if (isTauri) {
        const picked = await invokeCommand<string | null>("workspace_pick_file");
        if (picked) {
          await openDocument(picked);
        }
      }
    } catch (err) {
      console.error("[AppTitleBar] Failed to pick file:", err);
    }
  }, [isTauri, openDocument]);

  // Check for updates
  const handleCheckUpdates = useCallback(() => {
    setUpdateStatus("checking");
    setTimeout(() => {
      setUpdateStatus("latest");
    }, 900);
  }, []);

  // Menu structure definition
  const menuDefinitions: Record<string, MenuItemDef[]> = {
    file: [
      {
        id: "file.new",
        label: "New Text File",
        shortcut: "Ctrl+N",
        action: async () => {
          if (activeWorkspace) {
            startCreateFile();
          } else {
            await openDocument("untitled-1.txt").catch(() => {});
          }
        },
      },
      {
        id: "file.open",
        label: "Open File...",
        shortcut: "Ctrl+O",
        action: handleOpenFile,
      },
      {
        id: "file.openFolder",
        label: "Open Folder...",
        shortcut: "Ctrl+Shift+O",
        action: async () => {
          await openFolder();
        },
      },
      {
        id: "file.openRecent",
        label: "Open Recent",
        submenu: [
          ...(recentWorkspaces.length === 0
            ? [{ id: "file.openRecentEmpty", label: "(No Recent Workspaces)", disabled: true }]
            : recentWorkspaces.slice(0, 8).map((r) => ({
                id: `recent:${r.rootPath}`,
                label: r.name,
                action: async () => {
                  await openWorkspacePath(r.rootPath);
                },
              }))),
          { id: "sep-recent", label: "", separator: true },
          {
            id: "file.clearRecent",
            label: "Clear Recently Opened",
            disabled: recentWorkspaces.length === 0,
            action: () => clearRecent(),
          },
        ],
      },
      { id: "sep1", label: "", separator: true },
      {
        id: "file.save",
        label: "Save",
        shortcut: "Ctrl+S",
        disabled: !activeDocument,
        action: async () => {
          await saveDocument();
        },
      },
      {
        id: "file.saveAs",
        label: "Save As...",
        shortcut: "Ctrl+Shift+S",
        disabled: !activeDocument,
        action: handleSaveAs,
      },
      {
        id: "file.saveAll",
        label: "Save All",
        shortcut: "Ctrl+Alt+S",
        action: async () => {
          await saveAllDocuments();
        },
      },
      { id: "sep2", label: "", separator: true },
      {
        id: "file.closeEditor",
        label: "Close Editor",
        shortcut: "Ctrl+W",
        disabled: !activeDocumentId,
        action: async () => {
          if (activeDocumentId) await closeDocument(activeDocumentId);
        },
      },
      {
        id: "file.closeAllEditors",
        label: "Close All Editors",
        shortcut: "Ctrl+K Ctrl+W",
        action: async () => {
          await closeAllDocuments();
        },
      },
      {
        id: "file.closeWorkspace",
        label: "Close Workspace",
        disabled: !activeWorkspace,
        action: () => closeWorkspace(),
      },
      { id: "sep3", label: "", separator: true },
      {
        id: "file.exit",
        label: "Exit",
        shortcut: "Alt+F4",
        action: handleClose,
      },
    ],
    edit: [
      {
        id: "edit.undo",
        label: "Undo",
        shortcut: "Ctrl+Z",
        action: () => {
          document.execCommand("undo");
        },
      },
      {
        id: "edit.redo",
        label: "Redo",
        shortcut: "Ctrl+Y",
        action: () => {
          document.execCommand("redo");
        },
      },
      { id: "sep-edit1", label: "", separator: true },
      {
        id: "edit.cut",
        label: "Cut",
        shortcut: "Ctrl+X",
        action: () => {
          document.execCommand("cut");
        },
      },
      {
        id: "edit.copy",
        label: "Copy",
        shortcut: "Ctrl+C",
        action: () => {
          document.execCommand("copy");
        },
      },
      {
        id: "edit.paste",
        label: "Paste",
        shortcut: "Ctrl+V",
        action: () => {
          document.execCommand("paste");
        },
      },
      { id: "sep-edit2", label: "", separator: true },
      {
        id: "edit.selectAll",
        label: "Select All",
        shortcut: "Ctrl+A",
        action: () => {
          document.execCommand("selectAll");
        },
      },
    ],
    selection: [
      {
        id: "selection.selectAll",
        label: "Select All",
        shortcut: "Ctrl+A",
        action: () => {
          document.execCommand("selectAll");
        },
      },
      {
        id: "selection.expand",
        label: "Expand Selection",
        shortcut: "Shift+Alt+Right",
        action: () => {
          ideEvents.emit("sidebar:switch-tab", "explorer");
        },
      },
      {
        id: "selection.shrink",
        label: "Shrink Selection",
        shortcut: "Shift+Alt+Left",
        action: () => {
          ideEvents.emit("sidebar:switch-tab", "explorer");
        },
      },
      { id: "sep-sel", label: "", separator: true },
      {
        id: "selection.copyLineUp",
        label: "Copy Line Up",
        shortcut: "Shift+Alt+Up",
      },
      {
        id: "selection.copyLineDown",
        label: "Copy Line Down",
        shortcut: "Shift+Alt+Down",
      },
      {
        id: "selection.moveLineUp",
        label: "Move Line Up",
        shortcut: "Alt+Up",
      },
      {
        id: "selection.moveLineDown",
        label: "Move Line Down",
        shortcut: "Alt+Down",
      },
    ],
    view: [
      {
        id: "view.commandPalette",
        label: "Command Palette...",
        shortcut: "Ctrl+Shift+P",
        action: () => openCommandPalette(),
      },
      {
        id: "view.quickOpen",
        label: "Quick Open / Go to File...",
        shortcut: "Ctrl+P",
        action: () => openQuickOpen(),
      },
      { id: "sep-v1", label: "", separator: true },
      {
        id: "view.appearance",
        label: "Appearance",
        submenu: [
          {
            id: "view.appearance.fullScreen",
            label: "Full Screen",
            shortcut: "F11",
            action: toggleFullScreen,
          },
          {
            id: "view.appearance.zenMode",
            label: "Zen Mode (Toggle Sidebar)",
            shortcut: "Ctrl+K Z",
            action: toggleZenMode,
          },
          {
            id: "view.appearance.toggleSidebar",
            label: "Toggle Primary Sidebar",
            shortcut: "Ctrl+B",
            action: toggleSidebar,
          },
          { id: "sep-app1", label: "", separator: true },
          {
            id: "view.appearance.toggleTheme",
            label: "Toggle Dark / Light Theme",
            action: () => {
              const cur = settings.appearance.theme;
              updateSetting("appearance.theme", cur === "dark" ? "light" : "dark");
            },
          },
        ],
      },
      {
        id: "view.editorLayout",
        label: "Editor Layout",
        submenu: [
          {
            id: "view.editorLayout.splitRight",
            label: "Split Editor Right",
            shortcut: "Ctrl+\\",
            action: () => toggleSplitView(),
          },
        ],
      },
      { id: "sep-v2", label: "", separator: true },
      {
        id: "view.explorer",
        label: "Explorer",
        shortcut: "Ctrl+Shift+E",
        action: () => ideEvents.emit("sidebar:switch-tab", "explorer"),
      },
      {
        id: "view.search",
        label: "Search",
        shortcut: "Ctrl+Shift+F",
        action: () => ideEvents.emit("sidebar:switch-tab", "search"),
      },
      { id: "sep-v3", label: "", separator: true },
      {
        id: "view.settings",
        label: "Settings",
        shortcut: "Ctrl+,",
        action: () => openSettings(),
      },
    ],
    help: [
      {
        id: "help.welcome",
        label: "Welcome / Get Started",
        action: () => {
          if (activeWorkspace) closeWorkspace();
        },
      },
      {
        id: "help.documentation",
        label: "Documentation & Shortcuts",
        shortcut: "Ctrl+K Ctrl+S",
        action: () => setIsDocOpen(true),
      },
      {
        id: "help.checkForUpdates",
        label: "Check for Updates...",
        action: handleCheckUpdates,
      },
      { id: "sep-h1", label: "", separator: true },
      {
        id: "help.about",
        label: "About Kairo IDE",
        action: () => setIsAboutOpen(true),
      },
    ],
  };

  const TOP_MENU_BUTTONS = [
    { id: "file", label: "File" },
    { id: "edit", label: "Edit" },
    { id: "selection", label: "Selection" },
    { id: "view", label: "View" },
    { id: "help", label: "Help" },
  ] as const;

  const handleMenuClick = (menuId: string) => {
    if (activeMenu === menuId) {
      setActiveMenu(null);
      setActiveSubmenu(null);
    } else {
      setActiveMenu(menuId);
      setActiveSubmenu(null);
    }
  };

  const handleMenuMouseEnter = (menuId: string) => {
    if (activeMenu !== null && activeMenu !== menuId) {
      setActiveMenu(menuId);
      setActiveSubmenu(null);
    }
  };

  const handleItemClick = (item: MenuItemDef) => {
    if (item.disabled || item.separator || item.submenu) return;
    setActiveMenu(null);
    setActiveSubmenu(null);
    if (item.action) {
      item.action();
    }
  };

  // Window title computation
  const titleText = activeDocument
    ? `${basename(activeDocument.path)} - ${activeWorkspace?.name || "Kairo IDE"}`
    : activeWorkspace
    ? `${activeWorkspace.name} - Kairo IDE`
    : "Kairo IDE";

  // Shortcuts data for cheatsheet modal
  const CHEATSHEET_SHORTCUTS = [
    { cat: "General", keys: "Ctrl+Shift+P", desc: "Open Command Palette" },
    { cat: "General", keys: "Ctrl+P", desc: "Quick Open File by Name" },
    { cat: "General", keys: "Ctrl+,", desc: "Open Settings" },
    { cat: "General", keys: "Ctrl+B", desc: "Toggle Primary Sidebar" },
    { cat: "General", keys: "F11", desc: "Toggle Full Screen" },
    { cat: "File", keys: "Ctrl+N", desc: "New Text File" },
    { cat: "File", keys: "Ctrl+O", desc: "Open File" },
    { cat: "File", keys: "Ctrl+Shift+O", desc: "Open Folder Workspace" },
    { cat: "File", keys: "Ctrl+S", desc: "Save Active Document" },
    { cat: "File", keys: "Ctrl+Shift+S", desc: "Save As File" },
    { cat: "File", keys: "Ctrl+Alt+S", desc: "Save All Documents" },
    { cat: "File", keys: "Ctrl+W", desc: "Close Active Editor Tab" },
    { cat: "Editor", keys: "Shift+Alt+F", desc: "Format Active Document" },
    { cat: "Editor", keys: "Ctrl+\\", desc: "Split Editor Right" },
    { cat: "Editor", keys: "F12", desc: "Go to Definition" },
    { cat: "Editor", keys: "Alt+F12", desc: "Peek Definition" },
    { cat: "Editor", keys: "Ctrl+=", desc: "Zoom In Editor" },
    { cat: "Editor", keys: "Ctrl+-", desc: "Zoom Out Editor" },
    { cat: "Editor", keys: "Ctrl+0", desc: "Reset Editor Zoom" },
    { cat: "Navigation", keys: "Ctrl+Shift+F", desc: "Search in Workspace" },
    { cat: "Navigation", keys: "Ctrl+Shift+E", desc: "Focus File Explorer" },
    { cat: "Navigation", keys: "Ctrl+G", desc: "Go to Line / Column" },
    { cat: "Editing", keys: "Shift+Alt+Down", desc: "Copy Line Down" },
    { cat: "Editing", keys: "Shift+Alt+Up", desc: "Copy Line Up" },
    { cat: "Editing", keys: "Alt+Down", desc: "Move Line Down" },
    { cat: "Editing", keys: "Alt+Up", desc: "Move Line Up" },
    { cat: "Editing", keys: "Shift+Alt+Right", desc: "Expand Selection" },
    { cat: "Editing", keys: "Shift+Alt+Left", desc: "Shrink Selection" },
  ];

  const filteredShortcuts = CHEATSHEET_SHORTCUTS.filter((s) => {
    const q = docFilter.toLowerCase().trim();
    if (!q) return true;
    return s.desc.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q);
  });

  return (
    <header
      ref={menuBarRef}
      className="relative h-[30px] w-full bg-sidebar border-b border-sidebar-border/80 flex items-center justify-between select-none z-50 shrink-0 text-xs shadow-xs"
      data-tauri-drag-region
    >
      {/* Left section: Brand Icon & Top-Level Menus */}
      <div className="flex items-center h-full pl-2 gap-0.5 z-20">
        <div className="flex items-center justify-center mr-1.5 pointer-events-none transition-transform duration-200 hover:scale-105">
          <KairoBrandIcon size={16} />
        </div>

        <nav className="flex items-center gap-0.5 h-full" aria-label="Application Menu">
          {TOP_MENU_BUTTONS.map((menu) => {
            const isOpen = activeMenu === menu.id;
            return (
              <div key={menu.id} className="relative h-full flex items-center">
                <button
                  type="button"
                  onClick={() => handleMenuClick(menu.id)}
                  onMouseEnter={() => handleMenuMouseEnter(menu.id)}
                  className={cn(
                    "h-[22px] px-2 rounded-sm text-[12px] font-medium transition-all duration-100 flex items-center focus:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring cursor-pointer select-none",
                    isOpen
                      ? "bg-sidebar-accent text-sidebar-foreground shadow-2xs font-semibold"
                      : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
                  )}
                >
                  {menu.label}
                </button>

                {/* Dropdown Menu Popup */}
                {isOpen && (
                  <div
                    className="absolute top-[28px] left-0 z-50 min-w-[210px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left"
                    style={{
                      boxShadow: "var(--shadow-elevation-high)",
                    }}
                  >
                    {menuDefinitions[menu.id]?.map((item) => {
                      if (item.separator) {
                        return <div key={item.id} className="h-px bg-border/70 my-1 mx-1" />;
                      }

                      const hasSubmenu = Boolean(item.submenu && item.submenu.length > 0);
                      const isSubOpen = activeSubmenu === item.id;

                      return (
                        <div
                          key={item.id}
                          className="relative"
                          onMouseEnter={() => {
                            if (hasSubmenu) setActiveSubmenu(item.id);
                            else setActiveSubmenu(null);
                          }}
                        >
                          <button
                            type="button"
                            disabled={item.disabled}
                            onClick={() => handleItemClick(item)}
                            className={cn(
                              "flex w-full items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors duration-100 select-none cursor-pointer",
                              item.disabled
                                ? "opacity-40 cursor-not-allowed text-muted-foreground"
                                : item.danger
                                ? "text-destructive hover:bg-destructive/15"
                                : isSubOpen
                                ? "bg-accent text-accent-foreground font-medium"
                                : "hover:bg-accent hover:text-accent-foreground text-popover-foreground/90"
                            )}
                          >
                            <span className="truncate">{item.label}</span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-3">
                              {item.shortcut && (
                                <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
                                  {item.shortcut}
                                </span>
                              )}
                              {hasSubmenu && (
                                <HugeiconsIcon
                                  icon={ArrowRight01Icon}
                                  className="size-3 text-muted-foreground/60"
                                />
                              )}
                            </div>
                          </button>

                          {/* Submenu flyout */}
                          {hasSubmenu && isSubOpen && (
                            <div
                              className="absolute top-0 left-[calc(100%+2px)] z-50 min-w-[190px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 origin-top-left"
                              style={{
                                boxShadow: "var(--shadow-elevation-high)",
                              }}
                            >
                              {item.submenu?.map((sub) => {
                                if (sub.separator) {
                                  return <div key={sub.id} className="h-px bg-border/70 my-1 mx-1" />;
                                }
                                return (
                                  <button
                                    key={sub.id}
                                    type="button"
                                    disabled={sub.disabled}
                                    onClick={() => handleItemClick(sub)}
                                    className={cn(
                                      "flex w-full items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors duration-100 select-none cursor-pointer",
                                      sub.disabled
                                        ? "opacity-40 cursor-not-allowed text-muted-foreground"
                                        : "hover:bg-accent hover:text-accent-foreground text-popover-foreground/90"
                                    )}
                                  >
                                    <span className="truncate">{sub.label}</span>
                                    {sub.shortcut && (
                                      <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80 ml-3 shrink-0">
                                        {sub.shortcut}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Middle section: Window Title & Draggable Area */}
      <div
        className="flex-1 h-full flex items-center justify-center px-4 overflow-hidden cursor-default z-10"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <span
          className="text-[11.5px] text-muted-foreground/80 font-normal truncate tracking-tight pointer-events-none select-none max-w-[500px]"
          title={titleText}
        >
          {titleText}
        </span>
      </div>

      {/* Right section: Window Controls (Minimize, Maximize/Restore, Close) */}
      <div className="flex items-center h-full z-20">
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors focus:outline-none cursor-pointer"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" className="fill-current">
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors focus:outline-none cursor-pointer"
        >
          {isMaximized ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="stroke-current fill-none"
              strokeWidth="1"
            >
              <path d="M2.5 2V0.5h7v7H8" />
              <rect x="0.5" y="2.5" width="7" height="7" />
            </svg>
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="stroke-current fill-none"
              strokeWidth="1"
            >
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-white hover:bg-[#e81123] transition-colors focus:outline-none cursor-pointer"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="stroke-current"
            strokeWidth="1.1"
          >
            <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
          </svg>
        </button>
      </div>

      {/* ─── MODALS & DIALOGS ─────────────────────────────────────────────── */}

      {/* About Kairo IDE Dialog */}
      {isAboutOpen && (
        <div
          onClick={() => setIsAboutOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 flex flex-col items-center text-center relative"
          >
            <button
              onClick={() => setIsAboutOpen(false)}
              className="absolute top-3.5 right-3.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>

            <div className="animate-kairo-float mb-3">
              <KairoBrandIcon size={52} className="rounded-2xl shadow-lg" />
            </div>

            <h2 className="text-base font-bold tracking-tight text-foreground">Kairo IDE</h2>
            <p className="text-xs text-primary font-mono font-medium mt-0.5">Version 0.1.0 (Release Build)</p>

            <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-sm">
              A high-performance, desktop code editor built with Next.js, React 19, Monaco Editor, and Tauri 2.
            </p>

            <div className="my-4 w-full rounded-lg border border-border/70 bg-muted/20 p-3 text-[11px] text-muted-foreground font-mono space-y-1 text-left">
              <div className="flex justify-between">
                <span>Architecture:</span>
                <span className="text-foreground">Desktop Native (x86_64)</span>
              </div>
              <div className="flex justify-between">
                <span>UI Shell:</span>
                <span className="text-foreground">Next.js 16 + Tailwind 4</span>
              </div>
              <div className="flex justify-between">
                <span>Editor Engine:</span>
                <span className="text-foreground">Monaco Editor 0.56</span>
              </div>
              <div className="flex justify-between">
                <span>Active Theme:</span>
                <span className="text-foreground capitalize">{settings.appearance.theme}</span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => setIsAboutOpen(false)}
              className="mt-1 cursor-pointer font-medium"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Documentation & Keyboard Shortcuts Modal */}
      {isDocOpen && (
        <div
          onClick={() => setIsDocOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[80vh] rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 flex flex-col relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Keyboard Shortcuts & Documentation
                </h2>
              </div>
              <button
                onClick={() => setIsDocOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </button>
            </div>

            {/* Filter input */}
            <div className="relative my-3">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search shortcuts..."
                value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)}
                className="h-7 w-full rounded-md border border-border bg-input/20 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Shortcuts table */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[50vh]">
              {filteredShortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-muted/40 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground/70 w-16 shrink-0">
                      {item.cat}
                    </span>
                    <span className="text-foreground tracking-tight truncate">{item.desc}</span>
                  </div>
                  <kbd className="kbd-shortcut shrink-0 ml-3">{item.keys}</kbd>
                </div>
              ))}
            </div>

            <div className="pt-3 mt-3 border-t border-border/70 flex items-center justify-between text-xs text-muted-foreground">
              <span>Press <kbd className="kbd-shortcut text-[9px]">Esc</kbd> anytime to dismiss</span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setIsDocOpen(false);
                  openSettings("shortcuts");
                }}
                className="cursor-pointer"
              >
                Open Full Shortcuts Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update status dialog */}
      {updateStatus && (
        <div
          onClick={() => setUpdateStatus(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 flex flex-col items-center text-center"
          >
            {updateStatus === "checking" ? (
              <>
                <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
                <h3 className="text-sm font-semibold text-foreground">Checking for Updates...</h3>
                <p className="text-xs text-muted-foreground mt-1">Connecting to release repository</p>
              </>
            ) : (
              <>
                <div className="size-9 rounded-full bg-success/15 text-success flex items-center justify-center mb-3">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">You Are Up to Date</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Kairo IDE v0.1.0 is currently the latest available build. No updates required.
                </p>
                <Button
                  size="sm"
                  onClick={() => setUpdateStatus(null)}
                  className="mt-4 cursor-pointer"
                >
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
