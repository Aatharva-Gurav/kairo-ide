"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTerminal } from "../store";
import { TerminalSessionState } from "../types";
import { TerminalInstanceRegistry } from "../services/terminal-instance-registry";
import { TerminalContextMenu, ContextMenuPosition } from "./terminal-context-menu";
import {
  Terminal,
  Command,
  Plus,
  X,
  SplitSquareHorizontal,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TerminalSessionSidebarProps {
  className?: string;
}

export function TerminalSessionSidebar({ className }: TerminalSessionSidebarProps) {
  const {
    sessions,
    activeSessionId,
    activeSplitSessionId,
    splitSessionIds,
    setActiveTerminal,
    setActiveSplitTerminal,
    createTerminal,
    killTerminal,
    renameTerminal,
    splitTerminal,
    clearTerminal,
    clearBuffer,
  } = useTerminal();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    pos: ContextMenuPosition;
    sessionId: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus rename input on mount
  useEffect(() => {
    if (editingSessionId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingSessionId]);

  // If 1 or fewer sessions, sidebar is hidden
  if (sessions.length <= 1) {
    return null;
  }

  const startRename = (s: TerminalSessionState) => {
    setEditingSessionId(s.sessionId);
    setEditingTitle(s.title);
  };

  const commitRename = (sessionId: string) => {
    if (editingTitle.trim()) {
      renameTerminal(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === "Enter") {
      commitRename(sessionId);
    } else if (e.key === "Escape") {
      setEditingSessionId(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      pos: { x: e.clientX, y: e.clientY },
      sessionId,
    });
  };

  const handleSelectSession = (sessionId: string) => {
    if (splitSessionIds.includes(sessionId)) {
      setActiveSplitTerminal(sessionId);
    } else {
      setActiveTerminal(sessionId);
    }
    TerminalInstanceRegistry.focus(sessionId);
  };

  const getShellIcon = (name?: string) => {
    const lower = (name || "").toLowerCase();
    if (lower.includes("powershell") || lower.includes("pwsh")) {
      return <Terminal className="size-3.5 text-blue-500 shrink-0" />;
    }
    if (lower.includes("command prompt") || lower.includes("cmd")) {
      return <Command className="size-3.5 text-amber-500 shrink-0" />;
    }
    if (lower.includes("bash") || lower.includes("git")) {
      return <Terminal className="size-3.5 text-rose-500 shrink-0" />;
    }
    if (lower.includes("wsl") || lower.includes("ubuntu")) {
      return <Terminal className="size-3.5 text-orange-500 shrink-0" />;
    }
    return <Terminal className="size-3.5 text-primary shrink-0" />;
  };

  return (
    <TooltipProvider delay={250}>
      <aside
        aria-label="Terminal Sessions"
        className={cn(
          "w-52 shrink-0 border-l border-border/80 bg-sidebar/95 flex flex-col h-full select-none backdrop-blur-xs z-10 transition-all duration-150 ease-out",
          className
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 h-8 shrink-0 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider font-mono">
              Sessions
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
              {sessions.length}
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => createTerminal()}
                  aria-label="New Terminal"
                  className="size-5 rounded flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95"
                >
                  <Plus className="size-3.5" />
                </button>
              }
            />
            <TooltipContent side="left">New Terminal (Ctrl+Shift+`)</TooltipContent>
          </Tooltip>
        </div>

        {/* Sessions Vertical List */}
        <div
          role="tablist"
          aria-label="Active Terminal Sessions"
          className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5 no-scrollbar"
        >
          {sessions.map((s) => {
            const isActive =
              s.sessionId === activeSessionId || s.sessionId === activeSplitSessionId;
            const isEditing = s.sessionId === editingSessionId;
            const isExited = s.isExited || s.info.status === "exited";
            const isSplit = splitSessionIds.includes(s.sessionId);

            return (
              <div
                key={s.sessionId}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => handleSelectSession(s.sessionId)}
                onDoubleClick={() => startRename(s)}
                onContextMenu={(e) => handleContextMenu(e, s.sessionId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleSelectSession(s.sessionId);
                  } else if (e.key === "F2") {
                    startRename(s);
                  } else if (e.key === "Delete") {
                    killTerminal(s.sessionId);
                  }
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    killTerminal(s.sessionId);
                  }
                }}
                title={
                  isExited
                    ? `${s.title} (Process exited with code ${s.exitCode ?? 0})`
                    : `${s.title} (Click to switch, double-click to rename)`
                }
                className={cn(
                  "group relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-all duration-120 ease-out border",
                  isActive
                    ? "bg-accent/80 text-accent-foreground font-medium border-border/70 shadow-xs"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border-transparent"
                )}
              >
                {/* Left side: Status dot + Shell Icon + Title */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Status Indicator */}
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0 transition-colors",
                      isExited
                        ? "bg-muted-foreground/50"
                        : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                    )}
                  />

                  {/* Shell Icon */}
                  {getShellIcon(s.shellProfile?.name || s.title)}

                  {/* Title / Editable Input */}
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitRename(s.sessionId)}
                      onKeyDown={(e) => handleKeyDown(e, s.sessionId)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-5 w-full bg-background border border-primary/60 rounded px-1 text-[11px] font-sans text-foreground outline-none"
                    />
                  ) : (
                    <span className="truncate text-[11.5px] font-sans tracking-tight">
                      {s.title}
                    </span>
                  )}
                </div>

                {/* Right side: Split indicator & Hover actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Split Indicator Badge */}
                  {isSplit && !isEditing && (
                    <span
                      title="Part of current split view"
                      className="text-[9px] font-mono px-1 py-0.2 rounded bg-muted/60 text-muted-foreground border border-border/50 group-hover:hidden"
                    >
                      split
                    </span>
                  )}

                  {/* Action Buttons (Visible on hover or when focused) */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    {/* Split Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        splitTerminal("horizontal");
                      }}
                      title="Split Terminal"
                      aria-label="Split Terminal"
                      className="size-4.5 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <SplitSquareHorizontal className="size-3" />
                    </button>

                    {/* Close / Kill Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        killTerminal(s.sessionId);
                      }}
                      title="Close Terminal"
                      aria-label="Close Terminal"
                      className="size-4.5 rounded flex items-center justify-center hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <TerminalContextMenu
            position={contextMenu.pos}
            onClose={() => setContextMenu(null)}
            type="tab"
            sessionId={contextMenu.sessionId}
            onRename={() => {
              const session = sessions.find((s) => s.sessionId === contextMenu.sessionId);
              if (session) startRename(session);
            }}
            onSplitHorizontal={() => splitTerminal("horizontal")}
            onSplitVertical={() => splitTerminal("vertical")}
            onClear={() => clearTerminal(contextMenu.sessionId)}
            onClearBuffer={() => clearBuffer(contextMenu.sessionId)}
            onKill={() => killTerminal(contextMenu.sessionId)}
          />
        )}
      </aside>
    </TooltipProvider>
  );
}
