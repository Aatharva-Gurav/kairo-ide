"use client";

import React, { useRef, useEffect } from "react";
import { useFileExplorer } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

export function ExplorerSearchBar() {
  const { filterQuery, setFilterQuery, matchingCount } = useFileExplorer();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+F / Cmd+F shortcut to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        const target = e.target as HTMLElement;
        const isInputField =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (!isInputField || target === inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (filterQuery) {
        setFilterQuery("");
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className="flex items-center h-9 px-2.5 border-b border-sidebar-border/70 bg-sidebar/80 select-none shrink-0">
      <div className="relative flex flex-1 items-center min-w-0">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2 size-3 text-muted-foreground/70 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter files..."
          className="h-6.5 w-full rounded-md border border-sidebar-border/80 bg-background/60 pl-7 pr-14 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-primary/60 focus:ring-1 focus:ring-sidebar-primary/40 transition-all shadow-2xs"
        />
        {filterQuery ? (
          <div className="absolute right-1.5 flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground font-mono bg-sidebar-accent/80 border border-sidebar-border/60 px-1.5 py-0.5 rounded leading-none">
              {matchingCount}
            </span>
            <button
              onClick={() => {
                setFilterQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer rounded hover:bg-sidebar-accent transition-colors"
              title="Clear filter (Esc)"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            </button>
          </div>
        ) : (
          <kbd className="absolute right-1.5 text-[9px] text-muted-foreground/70 font-mono bg-sidebar-accent/50 border border-sidebar-border/60 px-1 py-0.5 rounded pointer-events-none select-none">
            Ctrl+F
          </kbd>
        )}
      </div>
    </div>
  );
}
