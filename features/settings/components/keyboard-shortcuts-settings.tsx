"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { CommandRegistry } from "@/features/commands/command-registry";
import { Command, ResolvedKeybinding } from "@/features/commands/types";
import { ShortcutRecorderModal } from "@/features/commands/components/shortcut-recorder-modal";
import { Button } from "@/components/ui/button";
import { Pencil, RotateCcw, Trash2, Search } from "lucide-react";

export function KeyboardShortcutsSettings() {
  const [search, setSearch] = useState("");
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [keybindings, setKeybindings] = useState<ResolvedKeybinding[]>(() =>
    KeybindingService.getAllResolvedKeybindings()
  );

  const refreshList = useCallback(() => {
    setKeybindings(KeybindingService.getAllResolvedKeybindings());
  }, []);

  useEffect(() => {
    return CommandRegistry.subscribe(refreshList);
  }, [refreshList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keybindings;

    return keybindings.filter(
      (item) =>
        item.command.title.toLowerCase().includes(q) ||
        item.command.id.toLowerCase().includes(q) ||
        item.command.category.toLowerCase().includes(q) ||
        item.keybinding.toLowerCase().includes(q)
    );
  }, [keybindings, search]);

  const handleResetAll = () => {
    KeybindingService.resetAllKeybindings();
    refreshList();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Search */}
      <div className="flex items-center justify-between gap-4 pb-3.5 border-b border-border/60">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Keyboard Shortcuts</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            View, customize, or restore default keybindings across all workbench commands.
          </p>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={handleResetAll}
          title="Reset all shortcuts to factory defaults"
          className="rounded-xl h-8 px-3 text-xs font-medium cursor-pointer"
        >
          <RotateCcw className="size-3 mr-1.5" />
          Reset All Shortcuts
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2.5 px-3.5 h-9.5 rounded-xl border border-border/70 bg-background/80 text-xs shadow-2xs">
        <Search className="size-3.5 text-muted-foreground/70 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter commands or shortcuts..."
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none font-sans"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full hover:bg-muted/60 transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Shortcuts Table */}
      <div className="rounded-2xl border border-border/60 overflow-hidden bg-card/60 dark:bg-[#202020]/40 shadow-xs">
        <div className="grid grid-cols-[1fr_auto_auto] items-center px-4.5 py-2.5 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60 select-none">
          <span>Command</span>
          <span className="w-36 text-center">Keybinding</span>
          <span className="w-24 text-right pr-2">Actions</span>
        </div>

        <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(({ command, keybinding, source }) => (
              <div
                key={command.id}
                onDoubleClick={() => setEditingCommand(command)}
                className="grid grid-cols-[1fr_auto_auto] items-center px-4.5 py-2.5 hover:bg-muted/30 transition-colors text-xs group select-none"
              >
                <div className="flex flex-col min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate text-xs">
                      {command.title}
                    </span>
                    <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/40 shrink-0">
                      {command.category}
                    </span>
                    {source === "user" && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                        Custom
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">
                    {command.id}
                  </span>
                </div>

                <div className="w-36 flex items-center justify-center">
                  {keybinding ? (
                    <kbd className="px-2.5 py-1 rounded-lg bg-background border border-border/80 font-mono text-[11px] font-semibold text-foreground shadow-2xs">
                      {keybinding}
                    </kbd>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/40 italic">—</span>
                  )}
                </div>

                <div className="w-24 flex items-center justify-end gap-1">
                  <button
                    onClick={() => setEditingCommand(command)}
                    title="Change keybinding"
                    className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 opacity-70 group-hover:opacity-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <Pencil className="size-3" />
                  </button>

                  {source === "user" && (
                    <button
                      onClick={() => {
                        KeybindingService.resetKeybinding(command.id);
                        refreshList();
                      }}
                      title="Reset to default"
                      className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer active:scale-95 transition-all"
                    >
                      <RotateCcw className="size-3" />
                    </button>
                  )}

                  {keybinding && (
                    <button
                      onClick={() => {
                        KeybindingService.clearKeybinding(command.id);
                        refreshList();
                      }}
                      title="Unbind shortcut"
                      className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer active:scale-95 transition-all"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="py-16 text-center text-xs text-muted-foreground">
              No matching commands or shortcuts found.
            </div>
          )}
        </div>
      </div>

      {/* Modal for Recording Shortcut */}
      <ShortcutRecorderModal
        command={editingCommand}
        isOpen={Boolean(editingCommand)}
        onClose={() => setEditingCommand(null)}
        onSaved={refreshList}
      />
    </div>
  );
}
