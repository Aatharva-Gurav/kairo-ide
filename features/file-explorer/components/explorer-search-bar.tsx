"use client";

import React, { useRef, useEffect } from "react";
import { useFileExplorer } from "../store";
import { Search, X, CheckSquare } from "lucide-react";

export function ExplorerSearchBar() {
  const {
    filterQuery,
    setFilterQuery,
    matchingCount,
    selectedPaths,
    clearSelection,
  } = useFileExplorer();
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

  const hasFilter = Boolean(filterQuery.trim());
  const hasMultiSelect = selectedPaths.size > 1;
  const showStatusStrip = hasMultiSelect || hasFilter;

  return (
    <div className="flex flex-col select-none shrink-0">
      {/* Search Bar Input Row */}
      <div className="flex items-center h-9 px-2.5 border-b border-sidebar-border/70 bg-sidebar/80">
        <div className="relative flex flex-1 items-center min-w-0">
          <Search
            className="absolute left-2.5 size-3.5 text-muted-foreground/60 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter files..."
            className="h-6.5 w-full rounded-md border border-sidebar-border/80 bg-background/60 pl-8 pr-12 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-primary/60 focus:ring-1 focus:ring-sidebar-primary/40 transition-all shadow-2xs font-sans"
          />
          {filterQuery ? (
            <button
              onClick={() => {
                setFilterQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 p-0.5 text-muted-foreground hover:text-foreground cursor-pointer rounded hover:bg-sidebar-accent transition-colors"
              title="Clear filter (Esc)"
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="absolute right-2 text-[9px] text-muted-foreground/60 font-mono bg-sidebar-accent/50 border border-sidebar-border/50 px-1 py-0.5 rounded pointer-events-none select-none">
              Ctrl+F
            </kbd>
          )}
        </div>
      </div>

      {/* Non-intrusive Counter & Status Strip below search bar */}
      {showStatusStrip && (
        <div className="flex items-center justify-between px-2.5 py-1 bg-muted/40 border-b border-sidebar-border/70 text-[11px] text-muted-foreground animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 min-w-0 truncate">
            {hasMultiSelect && (
              <span className="flex items-center gap-1.5 font-mono font-medium text-foreground shrink-0">
                <CheckSquare className="size-3 text-primary shrink-0" />
                <span>{selectedPaths.size} selected</span>
              </span>
            )}
            {hasMultiSelect && hasFilter && (
              <span className="text-muted-foreground/40 shrink-0">•</span>
            )}
            {hasFilter && (
              <span className="text-muted-foreground truncate font-sans">
                {matchingCount} match{matchingCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1.5">
            {hasMultiSelect && (
              <button
                type="button"
                onClick={clearSelection}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer transition-colors"
                title="Deselect All (Esc)"
              >
                <span>Deselect</span>
                <kbd className="text-[9px] font-mono text-muted-foreground/70">Esc</kbd>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
