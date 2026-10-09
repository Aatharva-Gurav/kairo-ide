"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CommandRegistry } from "@/features/commands/command-registry";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { Command } from "@/features/commands/types";
import { fuzzyFilter } from "@/features/commands/fuzzy-search";
import { Terminal } from "lucide-react";

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  initialQuery = "",
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allCommands, setAllCommands] = useState<Command[]>(() => CommandRegistry.getAll());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Subscribe to command registry changes
  useEffect(() => {
    return CommandRegistry.subscribe(() => {
      setAllCommands(CommandRegistry.getAll());
    });
  }, []);

  // Filter commands using fuzzy matching
  const filteredCommands = useMemo(() => {
    const clean = query.trim();
    return fuzzyFilter(allCommands, clean, (cmd) => [
      cmd.title,
      cmd.category,
      cmd.description || "",
      cmd.id,
      ...(cmd.keywords || []),
    ]);
  }, [allCommands, query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeSelected = useCallback(
    async (cmd?: Command) => {
      const target = cmd || filteredCommands[selectedIndex];
      if (!target) return;

      const isEnabled = CommandRegistry.isEnabled(target.id);
      if (!isEnabled) return;

      handleClose();
      await CommandRegistry.execute(target.id);
    },
    [filteredCommands, selectedIndex, handleClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeSelected();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-md pt-[12vh] px-4 animate-in fade-in-0 duration-200 ease-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-border/70 dark:border-white/10 bg-popover/95 dark:bg-[#1e1e1e]/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden flex flex-col max-h-[65vh] text-popover-foreground animate-in zoom-in-95 slide-in-from-top-3 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4.5 py-3 border-b border-border/60 bg-transparent">
          <Terminal className="size-4.5 text-primary shrink-0 opacity-80" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command to search or execute..."
            className="h-7 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none font-sans"
          />
          <kbd className="kbd-shortcut text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/60 border border-border/60 text-muted-foreground shadow-2xs">
            Esc
          </kbd>
        </div>

        {/* Command List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const isEnabled = CommandRegistry.isEnabled(cmd.id);
              const keybinding = KeybindingService.getRawKeybindingForCommand(cmd.id);
              const displayShortcut = KeybindingService.formatDisplay(keybinding);

              return (
                <div
                  key={cmd.id}
                  onClick={() => executeSelected(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer select-none transition-all duration-120 ease-out active:scale-[0.99] ${
                    !isEnabled
                      ? "opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "bg-muted/80 dark:bg-white/[0.08] text-foreground font-medium shadow-xs before:absolute before:left-1.5 before:top-2.5 before:bottom-2.5 before:w-1 before:bg-primary before:rounded-full pl-4"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-3">
                    <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground border border-border/40 shrink-0">
                      {cmd.category}
                    </span>
                    <span className="truncate font-medium text-xs">{cmd.title}</span>
                    {cmd.description && (
                      <span className="text-[11px] text-muted-foreground/80 truncate hidden sm:inline">
                        — {cmd.description}
                      </span>
                    )}
                  </div>

                  {displayShortcut && (
                    <kbd className="kbd-shortcut shrink-0 text-[11px] px-2 py-0.5 rounded-md bg-background/80 border border-border/70 text-muted-foreground shadow-2xs">
                      {displayShortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No commands matching &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="px-4.5 py-2.5 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground select-none">
          <span>{filteredCommands.length} command{filteredCommands.length === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd-shortcut px-1.5 py-0.2 rounded text-[10px]">↑</kbd>
              <kbd className="kbd-shortcut px-1.5 py-0.2 rounded text-[10px]">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd-shortcut px-1.5 py-0.2 rounded text-[10px]">↵</kbd>
              run
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
