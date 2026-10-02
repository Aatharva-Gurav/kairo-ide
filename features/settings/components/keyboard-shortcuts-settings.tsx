"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { CommandRegistry } from "@/features/commands/command-registry";
import { Command, ResolvedKeybinding } from "@/features/commands/types";
import { ShortcutRecorderModal } from "@/features/commands/components/shortcut-recorder-modal";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, ReloadIcon, Delete02Icon, Search01Icon } from "@hugeicons/core-free-icons";

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
    <div className="flex flex-col gap-4">
      {/* Header & Search */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/80">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Keyboard Shortcuts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            View, customize, or restore default keybindings across all workbench commands.
          </p>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={handleResetAll}
          title="Reset all shortcuts to factory defaults"
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={ReloadIcon} className="size-3 mr-1" />
          Reset All Shortcuts
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/80 bg-background text-xs shadow-2xs">
        <HugeiconsIcon icon={Search01Icon} className="size-3.5 text-muted-foreground/70 shrink-0" />
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
            className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/60 transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Shortcuts Table */}
      <div className="rounded-lg border border-border/80 overflow-hidden bg-card/60 shadow-2xs">
        <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/80 select-none">
          <span>Command</span>
          <span className="w-36 text-center">Keybinding</span>
          <span className="w-24 text-right pr-2">Actions</span>
        </div>

        <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(({ command, keybinding, source }) => (
              <div
                key={command.id}
                onDoubleClick={() => setEditingCommand(command)}
                className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 hover:bg-muted/40 transition-colors text-xs group select-none"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      {command.title}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground border border-border/70">
                      {command.category}
                    </span>
                    {source === "user" && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium">
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
                    <kbd className="kbd-shortcut font-medium text-foreground">
                      {keybinding}
                    </kbd>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/50 italic">—</span>
                  )}
                </div>

                <div className="w-24 flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditingCommand(command)}
                    title="Change keybinding"
                    className="opacity-70 group-hover:opacity-100 cursor-pointer active:scale-95 transition-all duration-120"
                  >
                    <HugeiconsIcon icon={Edit01Icon} className="size-3" />
                  </Button>

                  {source === "user" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        KeybindingService.resetKeybinding(command.id);
                        refreshList();
                      }}
                      title="Reset to default"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon icon={ReloadIcon} className="size-3" />
                    </Button>
                  )}

                  {keybinding && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        KeybindingService.clearKeybinding(command.id);
                        refreshList();
                      }}
                      title="Unbind shortcut"
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-muted-foreground italic">
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
