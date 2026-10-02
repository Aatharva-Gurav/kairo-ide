"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { CommandRegistry } from "@/features/commands/command-registry";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { Command } from "@/features/commands/types";
import { fuzzyFilter } from "@/features/commands/fuzzy-search";
import { HugeiconsIcon } from "@hugeicons/react";
import { TerminalIcon } from "@hugeicons/core-free-icons";

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs pt-[12vh] px-4 animate-in fade-in-0 duration-150 ease-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-border/80 bg-popover/98 shadow-2xl overflow-hidden flex flex-col max-h-[60vh] text-popover-foreground animate-in zoom-in-95 slide-in-from-top-3 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-3.5 border-b border-border/70 bg-popover/80 backdrop-blur-sm">
          <HugeiconsIcon icon={TerminalIcon} className="size-4 text-primary shrink-0" />
          <span className="text-xs font-mono font-bold text-primary select-none">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command to execute..."
            className="h-10 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none font-sans"
          />
          <kbd className="kbd-shortcut">
            Esc
          </kbd>
        </div>

        {/* Command List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 text-xs">
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
                  className={`relative flex items-center justify-between px-3 py-2 rounded-md cursor-pointer select-none transition-colors duration-100 ease-out active:scale-[0.99] ${
                    !isEnabled
                      ? "opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs before:absolute before:left-0.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-primary before:rounded-full"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-3">
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60 shrink-0">
                      {cmd.category}
                    </span>
                    <span className="truncate font-medium">{cmd.title}</span>
                    {cmd.description && (
                      <span className="text-[11px] text-muted-foreground/80 truncate hidden sm:inline">
                        — {cmd.description}
                      </span>
                    )}
                  </div>

                  {displayShortcut && (
                    <kbd className="kbd-shortcut shrink-0">
                      {displayShortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              No commands matching &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
