"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTerminal } from "../store";
import { useSettings } from "@/features/settings/store";
import { TerminalShellDropdown } from "./terminal-shell-dropdown";
import { ShellIcon } from "./shell-icon";
import { SiGnometerminal } from "@icons-pack/react-simple-icons";
import {
  Terminal,
  Plus,
  SplitSquareHorizontal,
  Maximize2,
  Minimize2,
  X,
  Search,
  MoreHorizontal,
  Eraser,
  Trash2,
  Settings,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TerminalPanelHeaderProps {
  onToggleFind: () => void;
  isFindOpen: boolean;
  className?: string;
}

export function TerminalPanelHeader({
  onToggleFind,
  isFindOpen,
  className,
}: TerminalPanelHeaderProps) {
  const {
    sessions,
    activeSessionId,
    activeSplitSessionId,
    isMaximized,
    toggleMaximize,
    setTerminalOpen,
    createTerminal,
    splitTerminal,
    splitDirection,
    closeSplit,
    clearTerminal,
    clearBuffer,
    killTerminal,
  } = useTerminal();

  const { openSettings } = useSettings();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const currentSessionId = activeSplitSessionId || activeSessionId;
  const currentSession = sessions.find((s) => s.sessionId === currentSessionId);

  // Close overflow menu on outside click or Escape
  useEffect(() => {
    if (!isOverflowOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOverflowOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOverflowOpen]);

  return (
    <TooltipProvider delay={250}>
      <header
        className={cn(
          "relative z-20 shrink-0 flex h-9 w-full items-center justify-between border-b border-border/70 bg-sidebar/95 px-2.5 select-none backdrop-blur-xs",
          className
        )}
      >
        {/* Left Section: Terminal Label & Active Session Info */}
        <div className="flex items-center gap-2 min-w-0 select-none">
          {/* Section Brand / Title */}
          <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs tracking-tight shrink-0 select-none">
            <div className="size-5 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <SiGnometerminal size={12} className="text-primary" />
            </div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
              Terminal
            </span>
          </div>

          {currentSession && (
            <>
              <div className="h-3 w-px bg-border/60 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <ShellIcon
                  name={currentSession.shellProfile?.name || currentSession.title}
                  size={13}
                />
                <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[220px]">
                  {currentSession.title}
                </span>
                {currentSession.isExited && (
                  <span className="text-[9px] font-mono text-muted-foreground/80 uppercase">
                    (exited)
                  </span>
                )}
              </div>
            </>
          )}

          {/* Split indicator when split mode active */}
          {splitDirection && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground border border-border/60 shrink-0 select-none font-medium">
              split: {splitDirection}
            </span>
          )}
        </div>

        {/* Right Section: Toolbar Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Grouped New Terminal & Shell Dropdown */}
          <div className="flex items-center rounded-md border border-border/70 bg-muted/20 hover:border-border transition-colors">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => createTerminal()}
                    aria-label="New Terminal (Ctrl+Shift+`)"
                    className="h-6 px-1.5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95"
                  >
                    <Plus className="size-3.5 text-primary" />
                  </button>
                }
              />
              <TooltipContent side="top">New Terminal (Ctrl+Shift+`)</TooltipContent>
            </Tooltip>
            <div className="h-3 w-px bg-border/60" />
            <TerminalShellDropdown buttonClassName="h-6 w-5" />
          </div>

          {/* Quick Clear Terminal Action */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => {
                    if (currentSessionId) clearTerminal(currentSessionId);
                  }}
                  aria-label="Clear Terminal (Ctrl+K)"
                  className="size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95"
                >
                  <Eraser className="size-3.5" />
                </button>
              }
            />
            <TooltipContent side="top">Clear Terminal (Ctrl+K)</TooltipContent>
          </Tooltip>

          {/* Split Terminal Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => splitTerminal("horizontal")}
                  aria-label="Split Terminal (Ctrl+Shift+5)"
                  className={cn(
                    "size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95",
                    splitDirection && "bg-accent text-foreground"
                  )}
                >
                  <SplitSquareHorizontal className="size-3.5" />
                </button>
              }
            />
            <TooltipContent side="top">Split Terminal (Ctrl+Shift+5)</TooltipContent>
          </Tooltip>

          {/* Find In Terminal Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onToggleFind}
                  aria-label="Find in Terminal (Ctrl+F)"
                  className={cn(
                    "size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95",
                    isFindOpen && "bg-accent text-foreground"
                  )}
                >
                  <Search className="size-3.5" />
                </button>
              }
            />
            <TooltipContent side="top">Find (Ctrl+F)</TooltipContent>
          </Tooltip>

          {/* Overflow Menu Button */}
          <div className="relative" ref={overflowRef}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setIsOverflowOpen((prev) => !prev)}
                    aria-label="More Terminal Actions"
                    className={cn(
                      "size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95",
                      isOverflowOpen && "bg-accent text-foreground"
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent side="top">More Actions</TooltipContent>
            </Tooltip>

            {isOverflowOpen && (
              <div
                role="menu"
                style={{
                  boxShadow: "var(--shadow-elevation-high, 0 10px 25px -5px rgba(0, 0, 0, 0.25))",
                }}
                className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[200px] rounded-xl border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-[0.98] duration-120 ease-out origin-top-right select-none"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    if (currentSessionId) clearTerminal(currentSessionId);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
                >
                  <Eraser className="size-3.5 text-muted-foreground" />
                  <span>Clear Terminal</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    if (currentSessionId) clearBuffer(currentSessionId);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
                >
                  <Terminal className="size-3.5 text-muted-foreground" />
                  <span>Clear Scrollback Buffer</span>
                </button>

                {splitDirection && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      closeSplit();
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
                  >
                    <X className="size-3.5 text-muted-foreground" />
                    <span>Un-split / Single View</span>
                  </button>
                )}

                <div className="h-px bg-border/70 my-1 mx-1" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    openSettings();
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100 text-muted-foreground hover:text-foreground"
                >
                  <Settings className="size-3.5" />
                  <span>Terminal Settings</span>
                </button>

                <div className="h-px bg-border/70 my-1 mx-1" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    if (currentSessionId) killTerminal(currentSessionId);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/15 text-destructive hover:text-destructive cursor-pointer text-left transition-colors duration-100"
                >
                  <Trash2 className="size-3.5" />
                  <span>Kill Active Terminal</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-3 w-px bg-border/60 mx-0.5 shrink-0" />

          {/* Maximize / Restore Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleMaximize}
                  aria-label={isMaximized ? "Restore Terminal Panel Size" : "Maximize Terminal Panel"}
                  className="size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95"
                >
                  {isMaximized ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </button>
              }
            />
            <TooltipContent side="top">
              {isMaximized ? "Restore Panel Size" : "Maximize Panel"}
            </TooltipContent>
          </Tooltip>

          {/* Close Terminal Panel Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setTerminalOpen(false)}
                  aria-label="Close Terminal Panel (Ctrl+`)"
                  className="size-6 flex items-center justify-center rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95"
                >
                  <X className="size-3.5" />
                </button>
              }
            />
            <TooltipContent side="top">Close Panel (Ctrl+`)</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
