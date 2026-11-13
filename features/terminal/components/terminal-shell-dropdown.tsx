"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTerminal } from "../store";
import { useSettings } from "@/features/settings/store";
import { ShellProfile } from "../types";
import { ShellIcon } from "./shell-icon";
import { ChevronDown, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TerminalShellDropdownProps {
  className?: string;
  buttonClassName?: string;
}

export function TerminalShellDropdown({ className, buttonClassName }: TerminalShellDropdownProps) {
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

  return (
    <TooltipProvider delay={200}>
      <div ref={containerRef} className={cn("relative inline-flex items-center", className)}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          title="Select Shell Profile to Launch"
          className={cn(
            "size-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95",
            isOpen ? "bg-accent text-foreground" : "hover:bg-muted/70",
            buttonClassName
          )}
        >
          <ChevronDown className="size-3 transition-transform duration-150" />
        </button>

        {isOpen && (
          <div
            role="menu"
            style={{
              boxShadow: "var(--shadow-elevation-high, 0 10px 25px -5px rgba(0, 0, 0, 0.25))",
            }}
            className="absolute top-[calc(100%+6px)] right-0 z-50 flex flex-row items-center gap-1 rounded-xl border border-border/80 bg-popover/98 backdrop-blur-md p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-[0.98] duration-120 ease-out origin-top-right select-none"
          >
            {availableShells.map((shell) => {
              const isDefault = shell.id === defaultShell?.id || shell.isDefault;

              return (
                <Tooltip key={shell.id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleSelectShell(shell)}
                        aria-label={shell.name}
                        className={cn(
                          "size-7 rounded-lg flex items-center justify-center relative cursor-pointer transition-all duration-120 active:scale-90",
                          isDefault
                            ? "bg-accent/60 text-accent-foreground border border-primary/30 hover:bg-accent"
                            : "hover:bg-muted/70 text-muted-foreground hover:text-foreground border border-transparent"
                        )}
                      >
                        <ShellIcon name={shell.name} size={15} />
                        {isDefault && (
                          <span
                            className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                            title="Default Shell"
                          />
                        )}
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs font-mono">
                    <span>{shell.name}</span>
                    {isDefault && (
                      <span className="text-[10px] text-primary ml-1 font-semibold">
                        (Default)
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {availableShells.length === 0 && (
              <span className="px-2 py-1 text-xs text-muted-foreground">No shells found</span>
            )}

            <div className="h-4 w-px bg-border/60 mx-0.5" />

            {/* Configure Terminal Settings Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      openSettings();
                    }}
                    aria-label="Terminal Settings"
                    className="size-7 rounded-lg flex items-center justify-center hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-90"
                  >
                    <Settings className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent side="bottom" className="text-xs">
                Terminal Settings
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
