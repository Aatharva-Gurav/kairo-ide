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
import { performTerminalToggle } from "./services/terminal-toggle";
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
  killTerminal: (sessionId: string, force?: boolean) => Promise<void>;
  pendingKillSession: TerminalSessionState | null;
  confirmKillTerminal: () => Promise<void>;
  cancelKillTerminal: () => void;
  killAllTerminals: () => Promise<void>;
  killWorkspaceTerminals: (workspaceId?: string) => Promise<void>;
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
  const [pendingKillSession, setPendingKillSession] = useState<TerminalSessionState | null>(null);

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
    return ideSettings.terminal?.panelHeight ?? DEFAULT_PANEL_HEIGHT;
  });

  const setPanelHeight = useCallback((height: number) => {
    const clamped = Math.max(MIN_PANEL_HEIGHT, height);
    setPanelHeightState(clamped);
    try {
      localStorage.setItem(PANEL_HEIGHT_KEY, clamped.toString());
    } catch {}
  }, []);

  // Sync panelHeight when changed from Settings
  const prevSettingsPanelHeightRef = useRef(ideSettings.terminal?.panelHeight);
  useEffect(() => {
    const nextHeight = ideSettings.terminal?.panelHeight;
    if (
      typeof nextHeight === "number" &&
      nextHeight !== prevSettingsPanelHeightRef.current
    ) {
      prevSettingsPanelHeightRef.current = nextHeight;
      setPanelHeight(nextHeight);
    }
  }, [ideSettings.terminal?.panelHeight, setPanelHeight]);

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const isCreatingInitialRef = useRef(false);

  const setTerminalOpen = useCallback((open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
  }, []);

  // Terminal Settings derived from IDE Settings
  const terminalSettings: TerminalSettings = useMemo(() => {
    const fromIde = ideSettings.terminal;
    const base: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...(fromIde || {}),
    };
    if (base.fontFamily && (base.fontFamily.includes("var(") || base.fontFamily.includes("var(--font-mono)"))) {
      base.fontFamily = DEFAULT_TERMINAL_SETTINGS.fontFamily;
    }
    return base;
  }, [ideSettings.terminal]);

  const terminalSettingsRef = useRef(terminalSettings);
  useEffect(() => {
    terminalSettingsRef.current = terminalSettings;
  }, [terminalSettings]);

  const customProfilesSyncRef = useRef<Promise<void>>(Promise.resolve());

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

  // Synchronize validated user custom shell profiles with the Rust backend
  useEffect(() => {
    const rawCustom = terminalSettings.customProfiles || [];
    const validCustom = rawCustom.filter((profile) => {
      const validation = TerminalProfileService.validateProfile(profile);
      if (!validation.valid) {
        console.warn(
          `[TerminalStore] Skipping invalid custom shell profile "${profile.name || profile.id}":`,
          validation.errors.join("; ")
        );
      }
      return validation.valid;
    });

    const syncPromise = TerminalIpcService.syncCustomProfiles(validCustom)
      .then(() => undefined)
      .catch((err) => {
        console.warn("[TerminalStore] Failed to sync custom shell profiles:", err);
      });

    customProfilesSyncRef.current = syncPromise;
  }, [terminalSettings.customProfiles]);

  // Merge discovered OS shells with validated user-defined custom profiles
  const allProfiles = useMemo(() => {
    const validCustom = (terminalSettings.customProfiles || []).filter(
      (profile) => TerminalProfileService.validateProfile(profile).valid
    );
    return TerminalProfileService.mergeProfiles(
      availableShells,
      validCustom,
      terminalSettings.defaultProfile
    );
  }, [availableShells, terminalSettings.customProfiles, terminalSettings.defaultProfile]);

  // Register terminal commands once in central CommandRegistry
  useEffect(() => {
    return registerTerminalCommands({
      isWorkspaceActive: () => Boolean(activeWorkspaceRef.current),
    });
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
      await customProfilesSyncRef.current;

      const selectedShell = shellId
        ? allProfiles.find((s) => s.id === shellId)
        : defaultShell;

      const cwd =
        customCwd ||
        selectedShell?.cwd ||
        terminalSettings.defaultCwd ||
        activeWorkspaceRef.current?.rootPath ||
        undefined;

      const currentWorkspaceId = activeWorkspaceRef.current?.id;

      try {
        const info = await TerminalIpcService.createSession({
          shellId: selectedShell?.id,
          cwd,
          workspaceId: currentWorkspaceId,
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
          workspaceId: currentWorkspaceId,
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
        isOpenRef.current = true;
        setIsOpen(true);

        return info.sessionId;
      } catch (err) {
        console.error("[TerminalStore] Failed to create terminal session:", err);
        throw err;
      }
    },
    [allProfiles, defaultShell, terminalSettings.defaultCwd]
  );

  // Terminate an active session (respecting terminal.confirmKillProcess when force is false)
  const killTerminal = useCallback(
    async (sessionId: string, force = false) => {
      if (!sessionId) return;
      const targetSession = sessionsRef.current.find((s) => s.sessionId === sessionId);
      if (
        !force &&
        terminalSettingsRef.current.confirmKillProcess &&
        targetSession &&
        !targetSession.isExited
      ) {
        setPendingKillSession(targetSession);
        return;
      }

      try {
        await TerminalIpcService.killSession(sessionId);
      } catch {
        // Backend process may already have terminated or exited gracefully
      } finally {
        TerminalInstanceRegistry.dispose(sessionId);

        const updated = sessionsRef.current.filter((s) => s.sessionId !== sessionId);
        sessionsRef.current = updated;
        setSessions(updated);

        if (activeSessionId === sessionId) {
          const nextActive = updated[updated.length - 1]?.sessionId ?? null;
          setActiveSessionId(nextActive);
          setActiveSplitSessionId(nextActive);
          if (!nextActive) {
            isOpenRef.current = false;
            setIsOpen(false);
          }
        } else {
          setActiveSplitSessionId((prev) => (prev === sessionId ? activeSessionId : prev));
        }

        const remainingSplit = splitSessionIds.filter((id) => id !== sessionId);
        if (remainingSplit.length <= 1) {
          setSplitDirection(null);
          setSplitSessionIds([]);
        } else {
          setSplitSessionIds(remainingSplit);
        }
      }
    },
    [activeSessionId, splitSessionIds]
  );

  const confirmKillTerminal = useCallback(async () => {
    const target = pendingKillSession;
    setPendingKillSession(null);
    if (target) {
      await killTerminal(target.sessionId, true);
    }
  }, [pendingKillSession, killTerminal]);

  const cancelKillTerminal = useCallback(() => {
    setPendingKillSession(null);
  }, []);

  // Terminate all active sessions and clean up background processes
  const killAllTerminals = useCallback(async () => {
    const currentSessions = sessionsRef.current;
    try {
      await TerminalIpcService.killAll();
    } catch {
      await Promise.allSettled(
        currentSessions.map((s) => TerminalIpcService.killSession(s.sessionId))
      );
    } finally {
      TerminalInstanceRegistry.disposeAll();

      sessionsRef.current = [];
      setSessions([]);
      setActiveSessionId(null);
      setActiveSplitSessionId(null);
      setSplitDirection(null);
      setSplitSessionIds([]);
      isOpenRef.current = false;
      setIsOpen(false);
    }
  }, []);

  // Terminate terminal sessions associated with a specific workspace ID (or all workspace sessions)
  const killWorkspaceTerminals = useCallback(async (targetWorkspaceId?: string): Promise<void> => {
    try {
      await TerminalIpcService.killWorkspaceSessions(targetWorkspaceId);
    } catch (err) {
      console.warn("[TerminalStore] Failed to terminate workspace terminal sessions:", err);
    } finally {
      const current = sessionsRef.current;
      const remaining = targetWorkspaceId
        ? current.filter((s) => s.workspaceId && s.workspaceId !== targetWorkspaceId)
        : [];
      const targets = targetWorkspaceId
        ? current.filter((s) => !s.workspaceId || s.workspaceId === targetWorkspaceId)
        : current;

      for (const s of targets) {
        TerminalInstanceRegistry.dispose(s.sessionId);
      }

      sessionsRef.current = remaining;
      setSessions(remaining);

      if (remaining.length === 0) {
        setActiveSessionId(null);
        setActiveSplitSessionId(null);
        setSplitDirection(null);
        setSplitSessionIds([]);
        isOpenRef.current = false;
        setIsOpen(false);
      } else {
        const nextActiveId = remaining[remaining.length - 1].sessionId;
        setActiveSessionId(nextActiveId);
        setActiveSplitSessionId(nextActiveId);
      }
    }
  }, []);

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
    setActiveSessionId(sessionId);
    setTimeout(() => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      instance?.term.focus();
    }, 30);
  }, []);

  const toggleTerminal = useCallback(() => {
    performTerminalToggle(
      {
        isOpenRef,
        isCreatingInitialRef,
        sessionsCount: sessionsRef.current.length,
      },
      setIsOpen,
      createTerminal
    );
  }, [createTerminal]);

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

      // If already split with 2 panes and direction is changing, simply toggle orientation
      if (splitDirection && splitSessionIds.length >= 2 && splitDirection !== direction) {
        setSplitDirection(direction);
        return;
      }

      const newSessionId = await createTerminal(shellId);
      setSplitDirection(direction);
      setSplitRatio(0.5);
      setSplitSessionIds([sourceSessionId, newSessionId]);
      setActiveSplitSessionId(newSessionId);
      setActiveSessionId(newSessionId);

      // Trigger resize after layout changes so both panes re-fit
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 50);
      }
    },
    [activeSessionId, activeSplitSessionId, createTerminal, splitDirection, splitSessionIds.length]
  );

  const closeSplit = useCallback(() => {
    setSplitDirection(null);
    setSplitSessionIds([]);
    if (activeSplitSessionId) {
      setActiveSessionId(activeSplitSessionId);
    }
  }, [activeSplitSessionId]);

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
      if (!activeWorkspaceRef.current) return;
      toggleTerminal();
    });
    const unlistenNew = ideEvents.on("terminal:new", (payload) => {
      if (!activeWorkspaceRef.current) return;
      createTerminal(payload?.shellId).catch(() => {});
    });
    const unlistenSplit = ideEvents.on("terminal:split", (direction) => {
      if (!activeWorkspaceRef.current) return;
      splitTerminal(direction || "horizontal").catch(() => {});
    });
    const unlistenClear = ideEvents.on("terminal:clear", () => {
      if (!activeWorkspaceRef.current) return;
      const curId = activeSplitSessionId || activeSessionId;
      if (curId) {
        clearTerminal(curId);
      }
    });
    const unlistenClosingWorkspace = ideEvents.on("workspace:closing", (payload) => {
      if (terminalSettingsRef.current.persistAcrossWorkspaces) return;
      killWorkspaceTerminals(payload?.workspace?.id).catch(() => {});
    });
    const unlistenCloseWorkspace = ideEvents.on("workspace:closed", () => {
      if (terminalSettingsRef.current.persistAcrossWorkspaces) return;
      killAllTerminals().catch(() => {});
    });
    const unlistenSwitchWorkspace = ideEvents.on("workspace:switched", () => {
      if (terminalSettingsRef.current.persistAcrossWorkspaces) return;
      killAllTerminals().catch(() => {});
    });
    const unlistenClose = ideEvents.on("terminal:close", () => {
      const curId = activeSplitSessionId || activeSessionId;
      if (curId) {
        killTerminal(curId).catch(() => {});
      }
    });
    const unlistenFocus = ideEvents.on("terminal:focus", () => {
      const curId = activeSplitSessionId || activeSessionId;
      if (!isOpenRef.current) {
        if (sessionsRef.current.length === 0) {
          if (activeWorkspaceRef.current) {
            createTerminal().catch(() => {});
          }
          return;
        }
        setTerminalOpen(true);
        if (curId) {
          setTimeout(() => {
            TerminalInstanceRegistry.focus(curId);
          }, 50);
        }
        return;
      }
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
      unlistenClosingWorkspace();
      unlistenCloseWorkspace();
      unlistenSwitchWorkspace();
    };
  }, [
    toggleTerminal,
    setTerminalOpen,
    createTerminal,
    splitTerminal,
    clearTerminal,
    killTerminal,
    killAllTerminals,
    killWorkspaceTerminals,
    setActiveTerminal,
    toggleMaximize,
    sessions,
    activeSessionId,
    activeSplitSessionId,
  ]);

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
    pendingKillSession,
    confirmKillTerminal,
    cancelKillTerminal,
    killAllTerminals,
    killWorkspaceTerminals,
    setActiveTerminal,
    setActiveSplitTerminal,
    toggleTerminal,
    setTerminalOpen,
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
