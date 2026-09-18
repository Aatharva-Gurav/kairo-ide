"use client";

import React, { useState, useEffect, useRef } from "react";
import { useEditor } from "../store";
import { NavigationService } from "../services/navigation.service";
import { Button } from "@/components/ui/button";

export function GoToLineModal() {
  const { isGoToLineVisible, setGoToLineVisible, monacoEditorRef } = useEditor();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isGoToLineVisible) return;
    const timer = setTimeout(() => {
      setValue("");
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isGoToLineVisible]);

  if (!isGoToLineVisible) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = value.trim().split(":");
    const line = parseInt(parts[0], 10);
    const col = parts[1] ? parseInt(parts[1], 10) : 1;

    if (!isNaN(line) && line > 0 && monacoEditorRef.current) {
      NavigationService.goToLine(monacoEditorRef.current, line, col);
    }
    setGoToLineVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setGoToLineVisible(false);
    }
  };

  return (
    <div
      onClick={() => setGoToLineVisible(false)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-xs pt-[15vh] px-4 animate-in fade-in-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl text-card-foreground animate-in zoom-in-95"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-foreground">
            Go to Line (e.g. 42 or 42:10)
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Line:Column"
            className="h-8 rounded border border-border bg-input/40 px-2.5 text-xs text-foreground outline-none ring-1 ring-sidebar-ring font-mono"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setGoToLineVisible(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="xs">
              Go
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

