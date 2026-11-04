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
import { useWorkspaceOptional } from "@/features/workspace/store";
import { useSettings } from "@/features/settings/store";

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

  createTerminal: (shellId?: string, cwd?: string) => Promise<string>;
  killTerminal: (sessionId: string) => Promise<void>;
  setActiveTerminal: (sessionId: string) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  setPanelHeight: (height: number) => void;
  toggleMaximize: () => void;
  renameTerminal: (sessionId: string, title: string) => void;
  clearTerminal: (sessionId: string) => void;
  splitTerminal: (direction: "horizontal" | "vertical", shellId?: string) => Promise<void>;
  closeSplit: () => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const workspaceContext = useWorkspaceOptional();
  const activeWorkspace = workspaceContext?.activeWorkspace ?? null;
  const { settings: ideSettings } = useSettings();

  const [sessions, setSessions] = useState<TerminalSessionState[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [panelHeight, setPanelHeight] = useState(240);
  const [splitSessionIds, setSplitSessionIds] = useState<string[]>([]);
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical" | null>(null);

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  // Terminal Settings derived from IDE Settings
  const terminalSettings: TerminalSettings = useMemo(() => {
    return {
      fontSize: ideSettings.editor.fontSize || DEFAULT_TERMINAL_SETTINGS.fontSize,
      fontFamily: ideSettings.editor.fontFamily || DEFAULT_TERMINAL_SETTINGS.fontFamily,
      lineHeight: DEFAULT_TERMINAL_SETTINGS.lineHeight,
      cursorStyle: DEFAULT_TERMINAL_SETTINGS.cursorStyle,
      cursorBlink: ideSettings.editor.cursorBlinking !== "solid",
      scrollback: DEFAULT_TERMINAL_SETTINGS.scrollback,
      copyOnSelect: DEFAULT_TERMINAL_SETTINGS.copyOnSelect,
    };
  }, [ideSettings.editor]);

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

  const defaultShell = useMemo(() => {
    return availableShells.find((s) => s.isDefault) || availableShells[0] || null;
  }, [availableShells]);

  // Create a new terminal session
  const createTerminal = useCallback(
    async (shellId?: string, customCwd?: string): Promise<string> => {
      const selectedShell = shellId
        ? availableShells.find((s) => s.id === shellId)
        : defaultShell;

      const cwd = customCwd || activeWorkspaceRef.current?.rootPath || undefined;

      try {
        const info = await TerminalIpcService.createSession({
          shellId: selectedShell?.id,
          cwd,
        });

        const newSessionState: TerminalSessionState = {
          sessionId: info.sessionId,
          title: selectedShell?.name || "Terminal",
          shellProfile: selectedShell || undefined,
          info,
          isExited: false,
        };

        setSessions((prev) => [...prev, newSessionState]);
        setActiveSessionId(info.sessionId);
        setIsOpen(true);

        return info.sessionId;
      } catch (err) {
        console.error("[TerminalStore] Failed to create terminal session:", err);
        throw err;
      }
    },
    [availableShells, defaultShell]
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
            if (!nextActive) {
              setIsOpen(false);
            }
          }
          return updated;
        });

        setSplitSessionIds((prev) => prev.filter((id) => id !== sessionId));
      }
    },
    [activeSessionId]
  );

  const setActiveTerminal = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    // Focus terminal when switched
    setTimeout(() => {
      const instance = TerminalInstanceRegistry.get(sessionId);
      instance?.term.focus();
    }, 50);
  }, []);

  const toggleTerminal = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && sessions.length === 0) {
        // Auto-create initial session if none open
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

  const splitTerminal = useCallback(
    async (direction: "horizontal" | "vertical", shellId?: string) => {
      if (!activeSessionId) return;

      const newSessionId = await createTerminal(shellId);
      setSplitDirection(direction);
      setSplitSessionIds([activeSessionId, newSessionId]);
    },
    [activeSessionId, createTerminal]
  );

  const closeSplit = useCallback(() => {
    setSplitDirection(null);
    setSplitSessionIds([]);
  }, []);

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
    createTerminal,
    killTerminal,
    setActiveTerminal,
    toggleTerminal,
    setTerminalOpen: setIsOpen,
    setPanelHeight,
    toggleMaximize,
    renameTerminal,
    clearTerminal,
    splitTerminal,
    closeSplit,
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
