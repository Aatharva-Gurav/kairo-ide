"use client";

import { useEffect, useRef, useCallback } from "react";
import { TerminalInstanceRegistry } from "../services/terminal-instance-registry";
import { TerminalIpcService } from "../services/terminal-ipc.service";
import { TerminalSettings } from "../types";

interface UseXtermOptions {
  sessionId: string;
  settings: TerminalSettings;
  theme: string;
  onExit?: (code: number | null) => void;
}

export function useXterm({
  sessionId,
  settings,
  theme,
  onExit,
}: UseXtermOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastColsRowsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  // Debounced resize handler
  const handleResize = useCallback(() => {
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }

    resizeTimerRef.current = setTimeout(() => {
      const dimensions = TerminalInstanceRegistry.fit(sessionId);
      if (!dimensions) return;

      const { cols, rows } = dimensions;
      if (
        cols > 0 &&
        rows > 0 &&
        (cols !== lastColsRowsRef.current.cols || rows !== lastColsRowsRef.current.rows)
      ) {
        lastColsRowsRef.current = { cols, rows };
        TerminalIpcService.resizeSession(sessionId, cols, rows).catch((err) => {
          console.error(`[useXterm] Failed to resize session ${sessionId}:`, err);
        });
      }
    }, 30);
  }, [sessionId]);

  // Initialize and attach xterm instance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Retrieve or create xterm instance
    TerminalInstanceRegistry.createOrGet(sessionId, settings, theme, onExit);
    TerminalInstanceRegistry.attach(sessionId, container);

    // Initial fit
    handleResize();

    // ResizeObserver on the container element
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [sessionId, settings, theme, onExit, handleResize]);

  // Sync theme changes
  useEffect(() => {
    TerminalInstanceRegistry.applyTheme(sessionId, theme);
  }, [sessionId, theme]);

  // Sync settings changes (font size, font family, line height, cursor, etc.)
  useEffect(() => {
    TerminalInstanceRegistry.applySettings(sessionId, settings);
    handleResize();
  }, [sessionId, settings, handleResize]);

  const focus = useCallback(() => {
    const instance = TerminalInstanceRegistry.get(sessionId);
    if (instance && !instance.disposed) {
      instance.term.focus();
    }
  }, [sessionId]);

  return {
    containerRef,
    focus,
  };
}
