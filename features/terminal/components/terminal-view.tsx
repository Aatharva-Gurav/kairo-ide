"use client";

import dynamic from "next/dynamic";
import React from "react";
import { TerminalSettings } from "../types";

export interface TerminalViewProps {
  sessionId: string;
  settings: TerminalSettings;
  isActive: boolean;
  onExit?: (code: number | null) => void;
  className?: string;
}

export const TerminalView = dynamic(
  () =>
    import("./terminal-view-inner").then((mod) => mod.TerminalViewInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center h-full w-full bg-background text-xs text-muted-foreground font-mono">
        Connecting terminal...
      </div>
    ),
  }
);
