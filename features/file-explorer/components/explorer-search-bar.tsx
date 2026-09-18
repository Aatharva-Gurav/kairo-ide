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
    <div className="flex items-center h-10 px-2.5 border-b border-sidebar-border/70 bg-sidebar/50 backdrop-blur-xs select-none shrink-0">
      <div className="relative flex flex-1 items-center min-w-0">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files..."
          className="h-7 w-full rounded-md bg-background/70 dark:bg-background/50 border border-sidebar-border/80 pl-8 pr-14 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none ring-1 ring-transparent focus:ring-sidebar-ring transition-all"
        />
        {filterQuery ? (
          <div className="absolute right-1.5 flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground font-mono bg-sidebar-accent/70 px-1 py-0.5 rounded leading-none">
              {matchingCount}
            </span>
            <button
              onClick={() => {
                setFilterQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer rounded"
              title="Clear search (Esc)"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            </button>
          </div>
        ) : (
          <span className="absolute right-2 text-[10px] text-muted-foreground/50 font-mono pointer-events-none select-none">
            Ctrl+F
          </span>
        )}
      </div>
    </div>
  );
}
