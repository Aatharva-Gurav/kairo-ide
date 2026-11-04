"use client";

import React, { useState } from "react";
import { useTerminal } from "../store";
import { TerminalView } from "./terminal-view";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, SplitSquareHorizontal, SplitSquareVertical, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TerminalTestHarness() {
  const {
    sessions,
    activeSessionId,
    availableShells,
    defaultShell,
    settings,
    createTerminal,
    killTerminal,
    setActiveTerminal,
    splitTerminal,
    splitDirection,
    closeSplit,
    splitSessionIds,
  } = useTerminal();

  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (shellId?: string) => {
    setIsCreating(true);
    try {
      await createTerminal(shellId);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full border border-border/80 rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Test Harness Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-sidebar border-b border-border/80">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Terminal Test Harness</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            ({sessions.length} active session{sessions.length === 1 ? "" : "s"})
          </span>
        </div>

        {/* Shell Quick Launch */}
        <div className="flex items-center gap-1.5">
          {availableShells.map((shell) => (
            <Button
              key={shell.id}
              size="xs"
              variant={shell.id === defaultShell?.id ? "default" : "outline"}
              onClick={() => handleCreate(shell.id)}
              disabled={isCreating}
              className="text-[11px] h-6 px-2 cursor-pointer"
            >
              <Plus className="size-3 mr-1" />
              {shell.name}
            </Button>
          ))}
          {availableShells.length === 0 && (
            <Button
              size="xs"
              onClick={() => handleCreate()}
              disabled={isCreating}
              className="text-[11px] h-6 px-2"
            >
              <Plus className="size-3 mr-1" />
              New Terminal
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Row */}
      {sessions.length > 0 && (
        <div className="flex items-center justify-between px-2 bg-sidebar/50 border-b border-border/60 overflow-x-auto">
          <div className="flex items-center gap-1 py-1">
            {sessions.map((s) => {
              const isActive = s.sessionId === activeSessionId;
              return (
                <div
                  key={s.sessionId}
                  onClick={() => setActiveTerminal(s.sessionId)}
                  className={cn(
                    "group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer select-none border transition-colors",
                    isActive
                      ? "bg-background text-foreground border-border shadow-2xs font-medium"
                      : "text-muted-foreground hover:text-foreground border-transparent hover:bg-sidebar-accent/50"
                  )}
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate max-w-[120px] font-mono text-[11px]">{s.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      killTerminal(s.sessionId);
                    }}
                    title="Kill Terminal Session"
                    className="size-3.5 flex items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive opacity-60 group-hover:opacity-100 transition-opacity ml-1"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Split Actions */}
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => splitTerminal("horizontal")}
              title="Split Horizontal (Side by Side)"
              className="size-6 p-0"
            >
              <SplitSquareHorizontal className="size-3.5" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => splitTerminal("vertical")}
              title="Split Vertical (Stacked)"
              className="size-6 p-0"
            >
              <SplitSquareVertical className="size-3.5" />
            </Button>
            {splitDirection && (
              <Button
                size="xs"
                variant="ghost"
                onClick={closeSplit}
                className="text-[10px] h-6 px-1.5 text-muted-foreground"
              >
                Close Split
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Terminal Viewport */}
      <div className="flex-1 w-full h-full min-h-[200px] overflow-hidden relative bg-background">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-center p-6 select-none">
            <TerminalIcon className="size-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-foreground">No Active Terminal Sessions</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Click a shell above to spawn a live PTY session.
            </p>
          </div>
        ) : splitDirection && splitSessionIds.length >= 2 ? (
          /* Split View Layout */
          <div
            className={cn(
              "flex h-full w-full overflow-hidden",
              splitDirection === "vertical" ? "flex-col" : "flex-row"
            )}
          >
            {splitSessionIds.map((sid) => (
              <div
                key={sid}
                className="flex-1 h-full w-full overflow-hidden border border-border/50 relative"
              >
                <TerminalView
                  sessionId={sid}
                  settings={settings}
                  isActive={true}
                  onExit={() => killTerminal(sid)}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Single / Tabbed Active View Layout (Hidden inactive sessions stay alive in DOM) */
          sessions.map((s) => (
            <div
              key={s.sessionId}
              className={cn(
                "h-full w-full overflow-hidden absolute inset-0",
                s.sessionId !== activeSessionId && "invisible pointer-events-none"
              )}
            >
              <TerminalView
                sessionId={s.sessionId}
                settings={settings}
                isActive={s.sessionId === activeSessionId}
                onExit={() => killTerminal(s.sessionId)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
