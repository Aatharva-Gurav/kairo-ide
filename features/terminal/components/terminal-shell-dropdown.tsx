"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTerminal } from "../store";
import { useSettings } from "@/features/settings/store";
import { ShellProfile } from "../types";
import {
  Terminal,
  Command,
  ChevronDown,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalShellDropdownProps {
  className?: string;
}

export function TerminalShellDropdown({ className }: TerminalShellDropdownProps) {
  const { availableShells, defaultShell, createTerminal } = useTerminal();
  const { openSettings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectShell = async (shell: ShellProfile) => {
    setIsOpen(false);
    await createTerminal(shell.id);
  };

  const getShellIcon = (name: string) => {
    const lower = name.toLowerCase();
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
    return <Terminal className="size-3.5 text-muted-foreground shrink-0" />;
  };

  return (
    <div ref={containerRef} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Select Shell Profile to Launch"
        className={cn(
          "size-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95",
          isOpen ? "bg-accent text-foreground" : "hover:bg-muted/70"
        )}
      >
        <ChevronDown className="size-3.5 transition-transform duration-150" />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            boxShadow: "var(--shadow-elevation-high, 0 10px 25px -5px rgba(0, 0, 0, 0.25))",
          }}
          className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[240px] rounded-xl border border-border/80 bg-popover/98 backdrop-blur-md p-1.5 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-[0.98] duration-120 ease-out origin-top-right select-none"
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 font-mono">
            Available Shell Profiles
          </div>

          <div className="flex flex-col gap-0.5 my-1">
            {availableShells.map((shell) => {
              const isDefault = shell.id === defaultShell?.id || shell.isDefault;
              return (
                <button
                  key={shell.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectShell(shell)}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getShellIcon(shell.name)}
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate text-xs text-foreground group-hover:text-accent-foreground">
                        {shell.name}
                      </span>
                      {shell.executable && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono truncate max-w-[160px]">
                          {shell.executable}
                        </span>
                      )}
                    </div>
                  </div>

                  {isDefault && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 shrink-0 ml-2 font-mono">
                      Default
                    </span>
                  )}
                </button>
              );
            })}

            {availableShells.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-muted-foreground text-center">
                No shell profiles detected.
              </div>
            )}
          </div>

          <div className="h-px bg-border/70 my-1 mx-1" />

          {/* Entry point to terminal settings */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              openSettings();
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100 text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" />
            <span>Configure Terminal Settings...</span>
          </button>
        </div>
      )}
    </div>
  );
}
