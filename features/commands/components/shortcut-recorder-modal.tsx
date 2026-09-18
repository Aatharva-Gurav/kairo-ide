"use client";

import React, { useState, useEffect, useRef } from "react";
import { Command, KeybindingConflict } from "../types";
import { KeybindingService } from "../keybinding.service";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in-0"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl text-card-foreground animate-in zoom-in-95"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-foreground">
            Keyboard Shortcut: {command.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            Press the desired key combination, then click Save or press Enter.
          </p>
        </div>

        {/* Shortcut Input Display */}
        <div className="my-5 flex flex-col items-center justify-center p-4 rounded-lg border border-dashed border-border bg-muted/30">
          <span className="text-[11px] text-muted-foreground mb-1.5 font-medium select-none">
            {displayKey ? "Recorded Combination:" : "Press keys on keyboard..."}
          </span>
          <div className="h-10 px-4 rounded-md bg-background border border-border flex items-center justify-center shadow-inner min-w-[140px]">
            <span className="text-sm font-bold font-mono tracking-wide text-foreground">
              {displayKey || "..."}
            </span>
          </div>
        </div>

        {/* Conflict Warning */}
        {conflict && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground flex items-start gap-2.5">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-500">Shortcut Conflict</p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed text-[11px]">
                <strong className="text-foreground">{conflict.key}</strong> is already assigned to{" "}
                <strong className="text-foreground">&ldquo;{conflict.existingCommand.title}&rdquo;</strong>.
                Saving will reassign this shortcut.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="xs" onClick={handleReset} className="cursor-pointer">
              Default
            </Button>
            <Button variant="ghost" size="xs" onClick={handleClear} className="cursor-pointer text-muted-foreground hover:text-destructive">
              Remove
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!recordedRawKey}
              className="cursor-pointer"
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

