"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../store";
import { TerminalPanelResizer } from "./terminal-panel-resizer";
import { TerminalPanelHeader } from "./terminal-panel-header";
import { TerminalSplitLayout } from "./terminal-split-layout";
import { TerminalSessionSidebar } from "./terminal-session-sidebar";
import { TerminalFindWidget } from "./terminal-find-widget";
import { ideEvents } from "@/lib/events";
import { cn } from "@/lib/utils";

interface TerminalPanelProps {
  className?: string;
}

export function TerminalPanel({ className }: TerminalPanelProps) {
  const {
    isOpen,
    isMaximized,
    panelHeight,
    setPanelHeight,
    sessions,
    pendingKillSession,
    confirmKillTerminal,
    cancelKillTerminal,
  } = useTerminal();
  const [isFindOpen, setIsFindOpen] = useState(false);

  // Keyboard shortcuts for kill confirmation modal
  useEffect(() => {
    if (!pendingKillSession) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelKillTerminal();
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmKillTerminal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingKillSession, cancelKillTerminal, confirmKillTerminal]);

  // Trigger resize event when sessions length changes to adjust terminal canvas
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [sessions.length]);

  // Open find widget when triggered via command/keybinding
  useEffect(() => {
    return ideEvents.on("terminal:find", () => {
      if (isOpen) {
        setIsFindOpen(true);
      }
    });
  }, [isOpen]);

  // If panel is not open, do not render layout space, but preserve state
  if (!isOpen) return null;

  return (
    <aside
      role="region"
      aria-label="Integrated Terminal"
      data-terminal-panel="true"
      style={{
        height: isMaximized ? "100%" : `${panelHeight}px`,
      }}
      className={cn(
        "relative flex flex-col w-full shrink-0 bg-background z-20 select-none transition-[height] duration-75 ease-out",
        isMaximized
          ? "border-0 flex-1 min-h-0 h-full rounded-none"
          : "border-t border-border/70 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] overflow-hidden",
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

      {/* Terminal Content Area (Workspace + Conditional Floating Sessions Sidebar) */}
      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden bg-background">
        {/* Terminal Canvas Workspace (Single or Split Views) */}
        <div className="flex-1 min-w-0 h-full overflow-hidden relative">
          <TerminalSplitLayout onOpenFind={() => setIsFindOpen(true)} />

          {/* Floating In-Terminal Find Widget */}
          {isFindOpen && (
            <TerminalFindWidget
              onClose={() => setIsFindOpen(false)}
              className={sessions.length > 1 ? "right-14" : "right-4"}
            />
          )}
        </div>

        {/* Floating Session Sidebar (Only visible when >1 terminal) */}
        {sessions.length > 1 && <TerminalSessionSidebar />}
      </div>

      {/* Confirm Kill Running Terminal Modal */}
      {pendingKillSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Terminate Terminal"
          onClick={cancelKillTerminal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Terminate active terminal?
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              &ldquo;{pendingKillSession.title}&rdquo; is still running. Closing it will terminate its active shell process.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelKillTerminal}
                className="h-7 px-3 rounded-lg border border-border/80 bg-background text-xs font-medium text-foreground hover:bg-accent cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmKillTerminal()}
                className="h-7 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 cursor-pointer transition-colors"
              >
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
