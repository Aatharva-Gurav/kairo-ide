"use client";

import React from "react";
import { useTerminal } from "../store";
import { ShellIcon } from "./shell-icon";
import { TerminalInstanceRegistry } from "../services/terminal-instance-registry";
import { Plus, X } from "lucide-react";
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
  } = useTerminal();

  // If 1 or fewer sessions, sidebar is hidden
  if (sessions.length <= 1) {
    return null;
  }

  const handleSelectSession = (sessionId: string) => {
    if (splitSessionIds.includes(sessionId)) {
      setActiveSplitTerminal(sessionId);
    } else {
      setActiveTerminal(sessionId);
    }
    TerminalInstanceRegistry.focus(sessionId);
  };

  return (
    <TooltipProvider delay={200}>
      <aside
        aria-label="Terminal Sessions"
        className={cn(
          "absolute top-2.5 right-3 z-30 flex flex-col items-center gap-1.5 p-1 rounded-xl border border-border/80 bg-sidebar/95 backdrop-blur-md shadow-xl select-none animate-in fade-in-0 zoom-in-[0.98] duration-150",
          className
        )}
      >
        {/* Session Icons */}
        <div
          role="tablist"
          aria-label="Active Terminal Sessions"
          className="flex flex-col items-center gap-1 max-h-[calc(100vh-280px)] overflow-y-auto no-scrollbar"
        >
          {sessions.map((s) => {
            const isActive =
              s.sessionId === activeSessionId || s.sessionId === activeSplitSessionId;
            const isExited = s.isExited || s.info.status === "exited";
            const isSplit = splitSessionIds.includes(s.sessionId);

            return (
              <Tooltip key={s.sessionId}>
                <TooltipTrigger
                  render={
                    <div
                      role="tab"
                      tabIndex={0}
                      aria-selected={isActive}
                      onClick={() => handleSelectSession(s.sessionId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleSelectSession(s.sessionId);
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
                      className={cn(
                        "group relative size-8 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-120 active:scale-95 outline-none",
                        isActive
                          ? "bg-accent text-accent-foreground border border-primary/40 shadow-xs ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground border border-transparent"
                      )}
                    >
                      {/* Shell Icon */}
                      <ShellIcon
                        name={s.shellProfile?.name || s.title}
                        size={16}
                        className={cn(
                          "transition-transform group-hover:scale-90",
                          isActive && "brightness-110"
                        )}
                      />

                      {/* Status indicator dot */}
                      <span
                        className={cn(
                          "absolute bottom-0.5 left-0.5 size-1.5 rounded-full ring-1 ring-background transition-colors",
                          isExited ? "bg-muted-foreground/60" : "bg-emerald-500"
                        )}
                      />

                      {/* Split badge dot if in split */}
                      {isSplit && (
                        <span
                          className="absolute top-0.5 left-0.5 size-1 rounded-full bg-primary/70"
                          title="Split pane"
                        />
                      )}

                      {/* Close button shown on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          killTerminal(s.sessionId);
                        }}
                        title={`Close ${s.title}`}
                        aria-label={`Close ${s.title}`}
                        className="absolute -top-1 -right-1 size-4 rounded-full bg-background/95 border border-border/80 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive shadow-xs hidden group-hover:flex items-center justify-center cursor-pointer transition-all duration-100 z-10 hover:scale-110 active:scale-90"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  }
                />
                <TooltipContent side="left" className="text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span>{s.title}</span>
                    {isExited && (
                      <span className="text-[10px] text-muted-foreground uppercase">(exited)</span>
                    )}
                    {isSplit && (
                      <span className="text-[10px] text-primary uppercase font-semibold">
                        [split]
                      </span>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="w-5 h-px bg-border/60 my-0.5" />

        {/* Quick Add Terminal Button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => createTerminal()}
                aria-label="New Terminal (Ctrl+Shift+`)"
                className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 cursor-pointer transition-all duration-120 active:scale-90"
              >
                <Plus className="size-3.5" />
              </button>
            }
          />
          <TooltipContent side="left" className="text-xs">
            New Terminal (Ctrl+Shift+`)
          </TooltipContent>
        </Tooltip>
      </aside>
    </TooltipProvider>
  );
}
