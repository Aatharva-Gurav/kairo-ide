"use client";

import React, { useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import { useXterm } from "../hooks/use-xterm";
import { TerminalSettings } from "../types";
import { useSettings } from "@/features/settings/store";
import { cn } from "@/lib/utils";

interface TerminalViewInnerProps {
  sessionId: string;
  settings: TerminalSettings;
  isActive: boolean;
  isVisible?: boolean;
  onExit?: (code: number | null) => void;
  className?: string;
}

export function TerminalViewInner({
  sessionId,
  settings,
  isActive,
  isVisible = true,
  onExit,
  className,
}: TerminalViewInnerProps) {
  const { settings: ideSettings } = useSettings();
  const currentTheme = ideSettings.appearance.theme;

  const { containerRef, focus } = useXterm({
    sessionId,
    settings,
    theme: currentTheme,
    onExit,
  });

  useEffect(() => {
    if (isActive && isVisible) {
      focus();
    }
  }, [isActive, isVisible, focus]);

  return (
    <div
      ref={containerRef}
      onClick={focus}
      className={cn(
        "h-full w-full overflow-hidden px-2.5 py-1.5 bg-background font-mono select-text",
        !isVisible && "hidden",
        className
      )}
      style={{
        lineHeight: settings.lineHeight,
      }}
    />
  );
}
