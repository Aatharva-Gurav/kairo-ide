"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTerminal } from "../store";
import { ChevronUp, ChevronDown, X, CaseSensitive, WholeWord, Regex } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalFindWidgetProps {
  onClose: () => void;
  className?: string;
}

export function TerminalFindWidget({ onClose, className }: TerminalFindWidgetProps) {
  const { activeSessionId, activeSplitSessionId, findNext, findPrevious } = useTerminal();
  const targetSessionId = activeSplitSessionId || activeSessionId;

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [hasMatches, setHasMatches] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const searchOptions = useMemo(
    () => ({
      caseSensitive,
      wholeWord,
      regex: useRegex,
    }),
    [caseSensitive, wholeWord, useRegex]
  );

  const executeFindNext = useCallback(
    (textToSearch?: string) => {
      const q = textToSearch !== undefined ? textToSearch : query;
      if (!targetSessionId || !q) {
        setHasMatches(null);
        return;
      }
      const found = findNext(targetSessionId, q, searchOptions);
      setHasMatches(found);
    },
    [targetSessionId, query, searchOptions, findNext]
  );

  const executeFindPrevious = useCallback(
    (textToSearch?: string) => {
      const q = textToSearch !== undefined ? textToSearch : query;
      if (!targetSessionId || !q) {
        setHasMatches(null);
        return;
      }
      const found = findPrevious(targetSessionId, q, searchOptions);
      setHasMatches(found);
    },
    [targetSessionId, query, searchOptions, findPrevious]
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val) {
      setHasMatches(null);
    } else {
      executeFindNext(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        executeFindPrevious();
      } else {
        executeFindNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="search"
      aria-label="Find in Terminal"
      className={cn(
        "absolute top-2 right-4 z-40 flex items-center gap-1.5 rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md px-2 py-1 shadow-xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-[0.98] duration-140 ease-[cubic-bezier(0.16,1,0.3,1)] select-none",
        className
      )}
      style={{
        boxShadow: "var(--shadow-elevation-high, 0 10px 25px -5px rgba(0, 0, 0, 0.2))",
      }}
    >
      {/* Search Input Container */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          className={cn(
            "h-6 w-44 rounded bg-background/80 px-2 pr-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 border outline-none transition-colors duration-100 focus:border-ring focus:ring-1 focus:ring-ring",
            query && hasMatches === false
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-border/60"
          )}
        />
        {query && (
          <span className="absolute right-2 text-[10px] font-mono text-muted-foreground/70 pointer-events-none">
            {hasMatches === false ? "No results" : ""}
          </span>
        )}
      </div>

      {/* Option Toggles */}
      <div className="flex items-center gap-0.5 border-r border-border/60 pr-1 mr-0.5">
        <button
          type="button"
          onClick={() => {
            setCaseSensitive((prev) => !prev);
            setTimeout(() => executeFindNext(), 10);
          }}
          title="Match Case (Alt+C)"
          aria-pressed={caseSensitive}
          className={cn(
            "size-5 flex items-center justify-center rounded transition-colors cursor-pointer",
            caseSensitive
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <CaseSensitive className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setWholeWord((prev) => !prev);
            setTimeout(() => executeFindNext(), 10);
          }}
          title="Match Whole Word (Alt+W)"
          aria-pressed={wholeWord}
          className={cn(
            "size-5 flex items-center justify-center rounded transition-colors cursor-pointer",
            wholeWord
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <WholeWord className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setUseRegex((prev) => !prev);
            setTimeout(() => executeFindNext(), 10);
          }}
          title="Use Regular Expression (Alt+R)"
          aria-pressed={useRegex}
          className={cn(
            "size-5 flex items-center justify-center rounded transition-colors cursor-pointer",
            useRegex
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Regex className="size-3.5" />
        </button>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => executeFindPrevious()}
          disabled={!query}
          title="Previous Match (Shift+Enter)"
          aria-label="Previous Match"
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors active:scale-95"
        >
          <ChevronUp className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => executeFindNext()}
          disabled={!query}
          title="Next Match (Enter)"
          aria-label="Next Match"
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors active:scale-95"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        title="Close (Escape)"
        aria-label="Close Find Widget"
        className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-95 ml-0.5"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
