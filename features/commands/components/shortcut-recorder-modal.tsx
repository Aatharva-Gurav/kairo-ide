"use client";

import React, { useState, useEffect, useRef } from "react";
import { Command, KeybindingConflict } from "../types";
import { KeybindingService } from "../keybinding.service";
import { Button } from "@/components/ui/button";
import { AlertCircle, Keyboard, X } from "lucide-react";

interface ShortcutRecorderModalProps {
  command: Command | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ShortcutRecorderContent({
  command,
  onClose,
  onSaved,
}: {
  command: Command;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialKey = KeybindingService.getRawKeybindingForCommand(command.id) || "";
  const [recordedRawKey, setRecordedRawKey] = useState<string>(initialKey);
  const [displayKey, setDisplayKey] = useState<string>(() =>
    KeybindingService.formatDisplay(initialKey)
  );
  const [conflict, setConflict] = useState<KeybindingConflict | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Escape to close modal if no keys are being held
      if (e.key === "Escape" && !recordedRawKey) {
        e.preventDefault();
        onClose();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const normalized = KeybindingService.normalizeKeyboardEvent(e);
      if (!normalized || ["ctrl", "alt", "shift", "control", "meta"].includes(normalized)) {
        return;
      }

      setRecordedRawKey(normalized);
      setDisplayKey(KeybindingService.formatDisplay(normalized));

      // Check conflict
      const foundConflict = KeybindingService.findConflict(normalized, command.id);
      setConflict(foundConflict);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [command, recordedRawKey, onClose]);

  const handleSave = () => {
    if (!recordedRawKey) return;
    KeybindingService.setKeybinding(command.id, recordedRawKey);
    onSaved();
    onClose();
  };

  const handleClear = () => {
    KeybindingService.clearKeybinding(command.id);
    onSaved();
    onClose();
  };

  const handleReset = () => {
    KeybindingService.resetKeybinding(command.id);
    onSaved();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in-0 duration-200"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border/70 dark:border-white/10 bg-card/98 dark:bg-[#1e1e1e]/98 p-6 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl text-card-foreground animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Keyboard className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Record Shortcut
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium truncate max-w-[260px]">
                {command.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Press the desired key combination on your keyboard, then save your changes.
        </p>

        {/* Shortcut Input Display */}
        <div className="my-5 flex flex-col items-center justify-center p-5 rounded-2xl border border-border/70 dark:border-white/10 bg-muted/30 dark:bg-black/20">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2.5 font-medium select-none">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            {displayKey ? "Recorded Combination" : "Listening for keystrokes..."}
          </span>
          <div className="h-11 px-5 rounded-xl bg-background border border-border/80 dark:border-white/15 flex items-center justify-center shadow-xs min-w-[150px]">
            <span className="text-sm font-semibold font-mono tracking-wide text-foreground">
              {displayKey || "..."}
            </span>
          </div>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-foreground flex items-start gap-2.5">
            <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-600 dark:text-amber-400 text-xs">Shortcut Conflict</p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed text-[11px]">
                <strong className="text-foreground font-mono">{conflict.key}</strong> is already assigned to{" "}
                <strong className="text-foreground">&ldquo;{conflict.existingCommand.title}&rdquo;</strong>.
                Saving will reassign this shortcut.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="xs" onClick={handleReset} className="rounded-lg cursor-pointer">
              Default
            </Button>
            <Button variant="ghost" size="xs" onClick={handleClear} className="rounded-lg cursor-pointer text-muted-foreground hover:text-destructive">
              Remove
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl cursor-pointer">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!recordedRawKey}
              className="rounded-xl cursor-pointer shadow-xs font-medium"
            >
              {conflict ? "Replace & Save" : "Save Shortcut"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShortcutRecorderModal({
  command,
  isOpen,
  onClose,
  onSaved,
}: ShortcutRecorderModalProps) {
  if (!isOpen || !command) return null;

  return (
    <ShortcutRecorderContent
      command={command}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

