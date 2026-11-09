"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../store";
import { TerminalPanelResizer } from "./terminal-panel-resizer";
import { TerminalPanelHeader } from "./terminal-panel-header";
import { TerminalSplitLayout } from "./terminal-split-layout";
import { TerminalSessionSidebar } from "./terminal-session-sidebar";
import { TerminalFindWidget } from "./terminal-find-widget";
import { cn } from "@/lib/utils";

interface TerminalPanelProps {
  className?: string;
}

export function TerminalPanel({ className }: TerminalPanelProps) {
  const { isOpen, isMaximized, panelHeight, setPanelHeight, sessions } = useTerminal();
  const [isFindOpen, setIsFindOpen] = useState(false);

  // Trigger resize event when sessions length crosses 1 (sidebar shown/hidden)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [sessions.length]);

  // If panel is not open, do not render layout space, but preserve state
  if (!isOpen) return null;

  return (
    <aside
      role="region"
      aria-label="Integrated Terminal"
      style={{
        height: isMaximized ? "100%" : `${panelHeight}px`,
      }}
      className={cn(
        "relative flex flex-col w-full shrink-0 bg-background z-20 select-none transition-[height] duration-75 ease-out",
        isMaximized
          ? "border-0 absolute inset-0 z-40 h-full rounded-none"
          : "rounded-t-xl border-t border-x border-border/80 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] overflow-hidden",
        className
      )}
    >
      {/* Draggable Panel Resizer (Hidden when maximized) */}
      {!isMaximized && (
        <TerminalPanelResizer
          height={panelHeight}
          onResize={setPanelHeight}
        />
      )}

      {/* Terminal Panel Header */}
      <TerminalPanelHeader
        onToggleFind={() => setIsFindOpen((prev) => !prev)}
        isFindOpen={isFindOpen}
      />

      {/* Terminal Content Area (Workspace + Conditional Right Vertical Sessions Sidebar) */}
      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden bg-background">
        {/* Terminal Canvas Workspace (Single or Split Views) */}
        <div className="flex-1 min-w-0 h-full overflow-hidden relative">
          <TerminalSplitLayout onOpenFind={() => setIsFindOpen(true)} />

          {/* Floating In-Terminal Find Widget */}
          {isFindOpen && (
            <TerminalFindWidget onClose={() => setIsFindOpen(false)} />
          )}
        </div>

        {/* Right-Side Vertical Session Sidebar (Only visible when >1 terminal) */}
        {sessions.length > 1 && <TerminalSessionSidebar />}
      </div>
    </aside>
  );
}
