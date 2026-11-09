"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTerminal } from "../store";
import { TerminalView } from "./terminal-view";
import { TerminalContextMenu, ContextMenuPosition } from "./terminal-context-menu";
import { Terminal, X, Plus } from "lucide-react";
import { TerminalInstanceRegistry } from "../services/terminal-instance-registry";
import { cn } from "@/lib/utils";

interface TerminalSplitLayoutProps {
  onOpenFind?: () => void;
  className?: string;
}

export function TerminalSplitLayout({ onOpenFind, className }: TerminalSplitLayoutProps) {
  const {
    sessions,
    activeSessionId,
    activeSplitSessionId,
    settings,
    splitDirection,
    splitSessionIds,
    splitRatio,
    setSplitRatio,
    createTerminal,
    setActiveTerminal,
    setActiveSplitTerminal,
    killTerminal,
    splitTerminal,
    copySelection,
    pasteToTerminal,
    selectAll,
    clearTerminal,
    clearBuffer,
  } = useTerminal();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [viewportContextMenu, setViewportContextMenu] = useState<{
    pos: ContextMenuPosition;
    sessionId: string;
  } | null>(null);

  // Resize divider tracking for split panes
  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (splitDirection === "vertical") {
        const newRatio = (e.clientY - rect.top) / rect.height;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      } else {
        const newRatio = (e.clientX - rect.left) / rect.width;
        setSplitRatio(Math.min(Math.max(newRatio, 0.15), 0.85));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
    };

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingDivider, splitDirection, setSplitRatio]);

  const handleViewportContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setViewportContextMenu({
      pos: { x: e.clientX, y: e.clientY },
      sessionId,
    });
  };

  const isSplitActive = Boolean(splitDirection && splitSessionIds.length >= 2);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden relative bg-background", className)}
    >
      {sessions.length === 0 ? (
        /* Empty state when no sessions are open */
        <div className="flex flex-col items-center justify-center h-full w-full text-center p-6 select-none bg-background">
          <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center mb-2.5 text-muted-foreground/80 border border-border/60">
            <Terminal className="size-5" />
          </div>
          <p className="text-xs font-semibold text-foreground">No active terminal sessions</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Press <kbd className="kbd-shortcut font-mono text-[10px] mx-1">Ctrl+Shift+`</kbd> to launch a new terminal.
          </p>
          <button
            type="button"
            onClick={() => createTerminal()}
            className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <Plus className="size-3.5" />
            <span>New Terminal</span>
          </button>
        </div>
      ) : isSplitActive ? (
        /* 2-Pane Resizable Split View */
        <div
          className={cn(
            "flex h-full w-full overflow-hidden relative",
            splitDirection === "vertical" ? "flex-col" : "flex-row"
          )}
        >
          {splitSessionIds.map((sid, idx) => {
            const isFirst = idx === 0;
            const isCurrentFocused = (activeSplitSessionId || activeSessionId) === sid;
            const session = sessions.find((s) => s.sessionId === sid);

            return (
              <React.Fragment key={sid}>
                {/* Split Pane Viewport */}
                <div
                  onMouseDown={() => {
                    setActiveSplitTerminal(sid);
                    TerminalInstanceRegistry.focus(sid);
                  }}
                  onContextMenu={(e) => handleViewportContextMenu(e, sid)}
                  style={
                    isFirst
                      ? splitDirection === "vertical"
                        ? { height: `${splitRatio * 100}%` }
                        : { width: `${splitRatio * 100}%` }
                      : undefined
                  }
                  className={cn(
                    "flex flex-col overflow-hidden relative bg-background transition-shadow duration-150",
                    isFirst
                      ? splitDirection === "vertical"
                        ? "w-full min-h-[80px]"
                        : "h-full min-w-[120px]"
                      : "flex-1 w-full h-full min-h-[80px] min-w-[120px]",
                    isCurrentFocused
                      ? "ring-1 ring-inset ring-primary/40"
                      : "opacity-90"
                  )}
                >
                  {/* Split Pane Mini Header */}
                  <div
                    className={cn(
                      "flex items-center justify-between px-2.5 py-0.5 h-6 shrink-0 border-b select-none transition-colors",
                      isCurrentFocused
                        ? "bg-muted/40 border-border/80 text-foreground"
                        : "bg-muted/20 border-border/50 text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Terminal className="size-3 text-primary shrink-0" />
                      <span className="text-[11px] font-mono font-medium truncate">
                        {session?.title || "Terminal"}
                      </span>
                      {session?.isExited && (
                        <span className="text-[9px] font-mono text-muted-foreground/80 uppercase">
                          (exited)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          killTerminal(sid);
                        }}
                        title="Close Split Session"
                        aria-label="Close Split Session"
                        className="size-4 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-90"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  </div>

                  {/* Terminal Canvas */}
                  <div className="flex-1 min-h-0 w-full overflow-hidden relative">
                    <TerminalView
                      sessionId={sid}
                      settings={settings}
                      isActive={isCurrentFocused}
                      isVisible={true}
                      onExit={() => killTerminal(sid)}
                    />
                  </div>
                </div>

                {/* Draggable Divider between panes */}
                {isFirst && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingDivider(true);
                    }}
                    role="separator"
                    aria-orientation={splitDirection === "vertical" ? "horizontal" : "vertical"}
                    aria-label="Resize Split Terminal Panes"
                    title={
                      splitDirection === "vertical"
                        ? "Drag to resize split rows"
                        : "Drag to resize split columns"
                    }
                    className={cn(
                      "transition-colors z-20 shrink-0 bg-border/70 flex items-center justify-center group select-none",
                      splitDirection === "vertical"
                        ? "h-1.5 w-full cursor-row-resize hover:bg-primary/50"
                        : "w-1.5 h-full cursor-col-resize hover:bg-primary/50",
                      isDraggingDivider && "bg-primary ring-1 ring-primary"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors",
                        splitDirection === "vertical" ? "h-0.5 w-8" : "w-0.5 h-8"
                      )}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        /* Tabbed / Single View Mode: Keep all inactive instances mounted in DOM with isVisible={false} */
        sessions.map((s) => {
          const isSelected = s.sessionId === activeSessionId;
          return (
            <div
              key={s.sessionId}
              onMouseDown={() => {
                setActiveTerminal(s.sessionId);
                TerminalInstanceRegistry.focus(s.sessionId);
              }}
              onContextMenu={(e) => handleViewportContextMenu(e, s.sessionId)}
              className={cn(
                "h-full w-full overflow-hidden absolute inset-0",
                !isSelected && "hidden"
              )}
            >
              <TerminalView
                sessionId={s.sessionId}
                settings={settings}
                isActive={isSelected}
                isVisible={isSelected}
                onExit={() => killTerminal(s.sessionId)}
              />
            </div>
          );
        })
      )}

      {/* Viewport Context Menu */}
      {viewportContextMenu && (
        <TerminalContextMenu
          position={viewportContextMenu.pos}
          onClose={() => setViewportContextMenu(null)}
          type="viewport"
          sessionId={viewportContextMenu.sessionId}
          onCopy={() => copySelection(viewportContextMenu.sessionId)}
          onPaste={() => pasteToTerminal(viewportContextMenu.sessionId)}
          onSelectAll={() => selectAll(viewportContextMenu.sessionId)}
          onFind={onOpenFind}
          onClear={() => clearTerminal(viewportContextMenu.sessionId)}
          onClearBuffer={() => clearBuffer(viewportContextMenu.sessionId)}
          onSplitHorizontal={() => splitTerminal("horizontal")}
          onSplitVertical={() => splitTerminal("vertical")}
          onKill={() => killTerminal(viewportContextMenu.sessionId)}
        />
      )}
    </div>
  );
}
