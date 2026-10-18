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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs pt-[15vh] px-4 animate-in fade-in-0 duration-150 ease-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border/80 bg-card p-4 shadow-2xl text-card-foreground animate-in zoom-in-95 slide-in-from-top-2 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-foreground tracking-tight">
            Go to Line (e.g. 42 or 42:10)
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Line:Column"
            className="h-7.5 rounded-md border border-border/80 bg-background px-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring font-mono shadow-2xs"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setGoToLineVisible(false)}
              className="cursor-pointer active:scale-95 transition-all duration-120"
            >
              Cancel
            </Button>
            <Button type="submit" size="xs" className="cursor-pointer active:scale-95 transition-all duration-120">
              Go
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

