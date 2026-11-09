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
import {
  DEFAULT_TERMINAL_SETTINGS,
  ShellProfile,
  TerminalSessionState,
  TerminalSettings,
} from "./types";
import { TerminalIpcService } from "./services/terminal-ipc.service";
import { TerminalInstanceRegistry } from "./services/terminal-instance-registry";
import { registerTerminalCommands } from "./services/terminal-commands";
import { TerminalProfileService } from "./services/terminal-profile.service";
import { useWorkspaceOptional } from "@/features/workspace/store";
import { useSettings } from "@/features/settings/store";
import { ideEvents } from "@/lib/events";

const PANEL_HEIGHT_KEY = "kairo:terminal_panel_height";
const DEFAULT_PANEL_HEIGHT = 260;
export const MIN_PANEL_HEIGHT = 120;

export interface TerminalContextValue {
  sessions: TerminalSessionState[];
  activeSessionId: string | null;
  activeSession: TerminalSessionState | null;
  availableShells: ShellProfile[];
  defaultShell: ShellProfile | null;
  isOpen: boolean;
  isMaximized: boolean;
  panelHeight: number;
  settings: TerminalSettings;
  splitSessionIds: string[];
  splitDirection: "horizontal" | "vertical" | null;
  splitRatio: number;
  activeSplitSessionId: string | null;

  createTerminal: (shellId?: string, cwd?: string) => Promise<string>;
  killTerminal: (sessionId: string) => Promise<void>;
  setActiveTerminal: (sessionId: string) => void;
  setActiveSplitTerminal: (sessionId: string) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  setPanelHeight: (height: number) => void;
  setSplitRatio: (ratio: number) => void;
  toggleMaximize: () => void;
  renameTerminal: (sessionId: string, title: string) => void;
  clearTerminal: (sessionId: string) => void;
  clearBuffer: (sessionId: string) => void;
  splitTerminal: (direction: "horizontal" | "vertical", shellId?: string) => Promise<void>;
  closeSplit: () => void;
  copySelection: (sessionId?: string) => Promise<void>;
  pasteToTerminal: (sessionId?: string) => Promise<void>;
  selectAll: (sessionId?: string) => void;
  findNext: (
    sessionId: string,
    query: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
  findPrevious: (
    sessionId: string,
    query: string,
    options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
  ) => boolean;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const workspaceContext = useWorkspaceOptional();
  const activeWorkspace = workspaceContext?.activeWorkspace ?? null;
  const { settings: ideSettings } = useSettings();

  const [sessions, setSessions] = useState<TerminalSessionState[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSplitSessionId, setActiveSplitSessionId] = useState<string | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [splitSessionIds, setSplitSessionIds] = useState<string[]>([]);
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical" | null>(null);
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

  const [panelHeight, setPanelHeightState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_HEIGHT;
    try {
      const saved = localStorage.getItem(PANEL_HEIGHT_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_PANEL_HEIGHT) {
          return val;
        }
      }
    } catch {}
    return DEFAULT_PANEL_HEIGHT;
  });

  const setPanelHeight = useCallback((height: number) => {
    const clamped = Math.max(MIN_PANEL_HEIGHT, height);
    setPanelHeightState(clamped);
    try {
      localStorage.setItem(PANEL_HEIGHT_KEY, clamped.toString());
    } catch {}
  }, []);

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  // Terminal Settings derived from IDE Settings
  const terminalSettings: TerminalSettings = useMemo(() => {
    const fromIde = ideSettings.terminal;
    if (!fromIde) return DEFAULT_TERMINAL_SETTINGS;
    return {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...fromIde,
    };
  }, [ideSettings.terminal]);

  // Load host shell profiles on mount
  useEffect(() => {
    let isMounted = true;
    TerminalIpcService.detectShells()
      .then((shells) => {
        if (isMounted) {
          setAvailableShells(shells);
        }
      })
      .catch((err) => {
        console.error("[TerminalStore] Failed to detect shell profiles:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Merge discovered OS shells with user-defined custom profiles
  const allProfiles = useMemo(() => {
    return TerminalProfileService.mergeProfiles(
      availableShells,
      terminalSettings.customProfiles || [],
      terminalSettings.defaultProfile
    );
  }, [availableShells, terminalSettings.customProfiles, terminalSettings.defaultProfile]);

  // Register terminal commands in central CommandRegistry
  useEffect(() => {
    return registerTerminalCommands();
  }, []);

  const defaultShell = useMemo(() => {
    return TerminalProfileService.resolveDefaultProfile(
      allProfiles,
      terminalSettings.defaultProfile
    );
  }, [allProfiles, terminalSettings.defaultProfile]);

  // Create a new terminal session
  const createTerminal = useCallback(
    async (shellId?: string, customCwd?: string): Promise<string> => {
      const selectedShell = shellId
        ? allProfiles.find((s) => s.id === shellId)
        : defaultShell;

      const cwd =
        customCwd ||
        selectedShell?.cwd ||
        terminalSettings.defaultCwd ||
        activeWorkspaceRef.current?.rootPath ||
        undefined;

      try {
        const info = await TerminalIpcService.createSession({
          shellId: selectedShell?.isCustom ? undefined : selectedShell?.id,
          executable: selectedShell?.isCustom ? selectedShell.executable : undefined,
          args: selectedShell?.args,
          env: selectedShell?.env,
          cwd,
        });

        // Run startup command if specified on profile
        if (selectedShell?.startupCommand && selectedShell.startupCommand.trim()) {
          setTimeout(() => {
            TerminalIpcService.writeSession(
              info.sessionId,
              selectedShell.startupCommand + "\r"
            ).catch(() => {});
          }, 200);
        }

        const newSessionState: TerminalSessionState = {
          sessionId: info.sessionId,
          title: selectedShell?.name || "Terminal",
          shellProfile: selectedShell || undefined,
          info,
          isExited: false,
        };

        // Listen for process exit to update tab status indicator
        TerminalIpcService.subscribeExit(info.sessionId, (payload) => {
          setSessions((prev) =>
            prev.map((s) =>
              s.sessionId === payload.sessionId
                ? {
                    ...s,
                    isExited: true,
                    exitCode: payload.code ?? undefined,
                    info: {
                      ...s.info,
                      status: "exited",
                      exitCode: payload.code ?? undefined,
                    },
                  }
                : s
            )
          );
        }).catch((err) => {
          console.warn("[TerminalStore] Failed to subscribe exit event for session:", err);
        });

        setSessions((prev) => [...prev, newSessionState]);
        setActiveSessionId(info.sessionId);
        setActiveSplitSessionId(info.sessionId);
        setIsOpen(true);

        return info.sessionId;
      } catch (err) {
        console.error("[TerminalStore] Failed to create terminal session:", err);
        throw err;
      }
    },
    [allProfiles, defaultShell, terminalSettings.defaultCwd]
  );

  // Terminate an active session
  const killTerminal = useCallback(
    async (sessionId: string) => {
      try {
        await TerminalIpcService.killSession(sessionId);
      } catch (err) {
        console.warn(`[TerminalStore] Error while killing session ${sessionId}:`, err);
      } finally {
        TerminalInstanceRegistry.dispose(sessionId);

        setSessions((prev) => {
          const updated = prev.filter((s) => s.sessionId !== sessionId);
          if (activeSessionId === sessionId) {
            const nextActive = updated[updated.length - 1]?.sessionId ?? null;
            setActiveSessionId(nextActive);
            setActiveSplitSessionId(nextActive);
            if (!nextActive) {
              setIsOpen(false);
            }
          }
          return updated;
        });

        setSplitSessionIds((prev) => {
          const remaining = prev.filter((id) => id !== sessionId);
          if (remaining.length <= 1) {
            setSplitDirection(null);
            return [];
          }
          return remaining;
        });
      }
    },
    [activeSessionId]
  );

  const setActiveTerminal = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveSplitSessionId(sessionId);
    setTimeout(() => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      instance?.term.focus();
    }, 50);
  }, []);

  const setActiveSplitTerminal = useCallback((sessionId: string) => {
    setActiveSplitSessionId(sessionId);
    setTimeout(() => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      instance?.term.focus();
    }, 30);
  }, []);

  const toggleTerminal = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && sessions.length === 0) {
        createTerminal().catch(() => {});
      }
      return next;
    });
  }, [sessions.length, createTerminal]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  const renameTerminal = useCallback((sessionId: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s))
    );
  }, []);

  const clearTerminal = useCallback((sessionId: string) => {
    const instance = TerminalInstanceRegistry.get(sessionId);
    if (instance && !instance.disposed) {
      instance.term.clear();
    }
  }, []);

  const clearBuffer = useCallback((sessionId: string) => {
    const instance = TerminalInstanceRegistry.get(sessionId);
    if (instance && !instance.disposed) {
      instance.term.reset();
    }
  }, []);

  const splitTerminal = useCallback(
    async (direction: "horizontal" | "vertical", shellId?: string) => {
      const sourceSessionId = activeSplitSessionId || activeSessionId;
      if (!sourceSessionId) {
        await createTerminal(shellId);
        return;
      }

      const newSessionId = await createTerminal(shellId);
      setSplitDirection(direction);
      setSplitRatio(0.5);
      setSplitSessionIds([sourceSessionId, newSessionId]);
      setActiveSplitSessionId(newSessionId);
    },
    [activeSessionId, activeSplitSessionId, createTerminal]
  );

  const closeSplit = useCallback(() => {
    setSplitDirection(null);
    setSplitSessionIds([]);
  }, []);

  const copySelection = useCallback(
    async (sessionId?: string) => {
      const targetId = sessionId || activeSplitSessionId || activeSessionId;
      if (!targetId) return;
      const instance = TerminalInstanceRegistry.get(targetId);
      if (instance && !instance.disposed) {
        const text = instance.term.getSelection();
        if (text && typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        }
      }
    },
    [activeSessionId, activeSplitSessionId]
  );

  const pasteToTerminal = useCallback(
    async (sessionId?: string) => {
      const targetId = sessionId || activeSplitSessionId || activeSessionId;
      if (!targetId) return;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          const text = await navigator.clipboard.readText();
          if (text) {
            await TerminalIpcService.writeSession(targetId, text);
          }
        }
      } catch (err) {
        console.error("[TerminalStore] Failed to paste clipboard to terminal:", err);
      }
    },
    [activeSessionId, activeSplitSessionId]
  );

  const selectAll = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId || activeSplitSessionId || activeSessionId;
      if (!targetId) return;
      const instance = TerminalInstanceRegistry.get(targetId);
      if (instance && !instance.disposed) {
        instance.term.selectAll();
      }
    },
    [activeSessionId, activeSplitSessionId]
  );

  const findNext = useCallback(
    (
      sessionId: string,
      query: string,
      options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
    ): boolean => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      if (instance && !instance.disposed && query) {
        return instance.searchAddon.findNext(query, options);
      }
      return false;
    },
    []
  );

  const findPrevious = useCallback(
    (
      sessionId: string,
      query: string,
      options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
    ): boolean => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      if (instance && !instance.disposed && query) {
        return instance.searchAddon.findPrevious(query, options);
      }
      return false;
    },
    []
  );

  // Subscribe to decoupled IDE event bus
  useEffect(() => {
    const unlistenToggle = ideEvents.on("terminal:toggle", () => {
      toggleTerminal();
    });
    const unlistenNew = ideEvents.on("terminal:new", (payload) => {
      createTerminal(payload?.shellId).catch(() => {});
    });
    const unlistenSplit = ideEvents.on("terminal:split", (direction) => {
      splitTerminal(direction || "horizontal").catch(() => {});
    });
    const unlistenClear = ideEvents.on("terminal:clear", () => {
      const curId = activeSplitSessionId || activeSessionId;
      if (curId) {
        clearTerminal(curId);
      }
    });
    const unlistenClose = ideEvents.on("terminal:close", () => {
      const curId = activeSplitSessionId || activeSessionId;
      if (curId) {
        killTerminal(curId).catch(() => {});
      }
    });
    const unlistenFocus = ideEvents.on("terminal:focus", () => {
      const curId = activeSplitSessionId || activeSessionId;
      if (curId) {
        TerminalInstanceRegistry.focus(curId);
      }
    });
    const unlistenNext = ideEvents.on("terminal:focus-next", () => {
      if (sessions.length <= 1) return;
      const curIdx = sessions.findIndex((s) => s.sessionId === activeSessionId);
      const nextIdx = (curIdx + 1) % sessions.length;
      const nextSession = sessions[nextIdx];
      if (nextSession) {
        setActiveTerminal(nextSession.sessionId);
        TerminalInstanceRegistry.focus(nextSession.sessionId);
      }
    });
    const unlistenPrev = ideEvents.on("terminal:focus-previous", () => {
      if (sessions.length <= 1) return;
      const curIdx = sessions.findIndex((s) => s.sessionId === activeSessionId);
      const prevIdx = (curIdx - 1 + sessions.length) % sessions.length;
      const prevSession = sessions[prevIdx];
      if (prevSession) {
        setActiveTerminal(prevSession.sessionId);
        TerminalInstanceRegistry.focus(prevSession.sessionId);
      }
    });
    const unlistenMaximize = ideEvents.on("terminal:maximize", () => {
      toggleMaximize();
    });

    return () => {
      unlistenToggle();
      unlistenNew();
      unlistenSplit();
      unlistenClear();
      unlistenClose();
      unlistenFocus();
      unlistenNext();
      unlistenPrev();
      unlistenMaximize();
    };
  }, [
    toggleTerminal,
    createTerminal,
    splitTerminal,
    clearTerminal,
    killTerminal,
    setActiveTerminal,
    toggleMaximize,
    sessions,
    activeSessionId,
    activeSplitSessionId,
  ]);

  // Global keyboard shortcut: Ctrl+` (or Cmd+`) toggles terminal panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        toggleTerminal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTerminal]);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.sessionId === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const value: TerminalContextValue = {
    sessions,
    activeSessionId,
    activeSession,
    availableShells,
    defaultShell,
    isOpen,
    isMaximized,
    panelHeight,
    settings: terminalSettings,
    splitSessionIds,
    splitDirection,
    splitRatio,
    activeSplitSessionId,
    createTerminal,
    killTerminal,
    setActiveTerminal,
    setActiveSplitTerminal,
    toggleTerminal,
    setTerminalOpen: setIsOpen,
    setPanelHeight,
    setSplitRatio,
    toggleMaximize,
    renameTerminal,
    clearTerminal,
    clearBuffer,
    splitTerminal,
    closeSplit,
    copySelection,
    pasteToTerminal,
    selectAll,
    findNext,
    findPrevious,
  };

  return (
    <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
  );
}

export function useTerminal(): TerminalContextValue {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminal must be used within a TerminalProvider");
  }
  return context;
}

export function useTerminalOptional(): TerminalContextValue | null {
  return useContext(TerminalContext);
}
