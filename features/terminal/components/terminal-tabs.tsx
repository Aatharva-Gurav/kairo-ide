"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTerminal } from "../store";
import { TerminalSessionState } from "../types";
import { TerminalContextMenu, ContextMenuPosition } from "./terminal-context-menu";
import { Terminal, Command, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TerminalTabs() {
  const {
    sessions,
    activeSessionId,
    setActiveTerminal,
    killTerminal,
    renameTerminal,
    splitTerminal,
    clearTerminal,
  } = useTerminal();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    pos: ContextMenuPosition;
    sessionId: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingSessionId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingSessionId]);

  // Handle horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

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

  const getShellIcon = (name?: string) => {
    const lower = (name || "").toLowerCase();
    if (lower.includes("cmd") || lower.includes("command prompt")) {
      return <Command className="size-3 text-amber-500 shrink-0" />;
    }
    return <Terminal className="size-3 text-primary shrink-0" />;
  };

  return (
    <>
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        role="tablist"
        aria-label="Terminal Sessions"
        className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-1 max-w-full select-none"
      >
        {sessions.map((s) => {
          const isActive = s.sessionId === activeSessionId;
          const isEditing = s.sessionId === editingSessionId;
          const isExited = s.isExited || s.info.status === "exited";

          return (
            <div
              key={s.sessionId}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTerminal(s.sessionId)}
              onDoubleClick={() => startRename(s)}
              onContextMenu={(e) => handleContextMenu(e, s.sessionId)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  // Middle click closes tab
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
                "group relative flex h-[28px] shrink-0 items-center gap-1.5 px-2.5 rounded-md text-[12px] cursor-pointer select-none transition-all duration-140 ease-[cubic-bezier(0.16,1,0.3,1)] font-sans tracking-tight border",
                isActive
                  ? "bg-background text-foreground font-medium shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] border-border/80 dark:bg-[#1f1f23] z-10"
                  : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 border-transparent"
              )}
            >
              {/* Status Indicator Dot */}
              <span
                className={cn(
                  "size-1.5 rounded-full shrink-0 transition-colors",
                  isExited
                    ? "bg-muted-foreground/50 ring-1 ring-muted-foreground/30"
                    : "bg-emerald-500 ring-2 ring-emerald-500/20"
                )}
              />

              {/* Shell icon */}
              {getShellIcon(s.shellProfile?.name || s.title)}

              {/* Tab Title or Inline Rename Input */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => commitRename(s.sessionId)}
                  onKeyDown={(e) => handleKeyDown(e, s.sessionId)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-24 rounded bg-background px-1 text-xs font-mono text-foreground border border-primary outline-none"
                />
              ) : (
                <span className="truncate max-w-[130px] font-mono text-[11px]">
                  {s.title}
                </span>
              )}

              {/* Exited label indicator */}
              {isExited && (
                <span className="text-[9px] font-mono text-muted-foreground/70 uppercase">
                  (exited)
                </span>
              )}

              {/* Close Button */}
              <button
                type="button"
                aria-label={`Close ${s.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  killTerminal(s.sessionId);
                }}
                className={cn(
                  "size-4 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-120 active:scale-90 ml-0.5",
                  isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <TerminalContextMenu
          position={contextMenu.pos}
          onClose={() => setContextMenu(null)}
          type="tab"
          sessionId={contextMenu.sessionId}
          onRename={() => {
            const s = sessions.find((x) => x.sessionId === contextMenu.sessionId);
            if (s) startRename(s);
          }}
          onSplitHorizontal={() => splitTerminal("horizontal")}
          onClear={() => clearTerminal(contextMenu.sessionId)}
          onKill={() => killTerminal(contextMenu.sessionId)}
        />
      )}
    </>
  );
}
