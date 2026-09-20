"use client";

import React, { useState, useEffect } from "react";
import { useSearch } from "../store";
import { useWorkspace } from "@/features/workspace/store";
import { SearchResultItem } from "./search-result-item";
import { ReplaceConfirmModal } from "./replace-confirm-modal";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  FilterIcon,
  RefreshIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function WorkspaceSearchPanel() {
  const { activeWorkspace } = useWorkspace();
  const {
    query,
    setQuery,
    replaceQuery,
    setReplaceQuery,
    isReplaceOpen,
    toggleReplaceOpen,
    options,
    updateOption,
    results,
    totalMatches,
    isSearching,
    isReplacing,
    error,
    expandedFiles,
    toggleFileExpand,
    collapseAllFiles,
    expandAllFiles,
    performSearch,
    clearSearch,
    requestReplaceAll,
  } = useSearch();

  const [showFilters, setShowFilters] = useState(false);

  // Debounced search when options or query change
  useEffect(() => {
    if (!query.trim()) {
      return;
    }
    const timer = setTimeout(() => {
      performSearch();
    }, 250);
    return () => clearTimeout(timer);
  }, [query, options, performSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch();
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full w-full overflow-hidden bg-sidebar select-none text-sidebar-foreground">
      {/* Search Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-sidebar-border/80 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          Search
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => performSearch()}
            title="Refresh Search"
            className="p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              className={cn("size-3.5", isSearching && "animate-spin text-sidebar-primary")}
            />
          </button>
          <button
            type="button"
            onClick={clearSearch}
            title="Clear Search"
            className="p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer transition-colors"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={collapseAllFiles}
            title="Collapse All Results"
            className="px-1 py-0.5 rounded hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer text-[10px] font-mono transition-colors"
          >
            [-]
          </button>
          <button
            type="button"
            onClick={expandAllFiles}
            title="Expand All Results"
            className="px-1 py-0.5 rounded hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer text-[10px] font-mono transition-colors"
          >
            [+]
          </button>
        </div>
      </div>

      {/* Query and Replace Controls */}
      <div className="px-2.5 py-2 border-b border-sidebar-border/80 flex flex-col gap-2 shrink-0">
        {/* Search input row */}
        <div className="flex items-center gap-1 w-full">
          <button
            type="button"
            onClick={toggleReplaceOpen}
            title="Toggle Replace"
            className="p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-foreground text-muted-foreground cursor-pointer shrink-0 transition-colors"
          >
            <HugeiconsIcon
              icon={isReplaceOpen ? ArrowDown01Icon : ArrowRight01Icon}
              className="size-3 transition-transform"
            />
          </button>

          <div className="relative flex-1 flex items-center min-w-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="h-6.5 w-full rounded border border-sidebar-border/80 bg-background/50 px-2 pr-16 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring font-sans transition-colors"
            />

            {/* In-input option toggles */}
            <div className="absolute right-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => updateOption("isCaseSensitive", !options.isCaseSensitive)}
                title="Match Case (Alt+C)"
                className={cn(
                  "size-4.5 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-pointer transition-all duration-120 active:scale-90",
                  options.isCaseSensitive
                    ? "bg-primary text-primary-foreground shadow-2xs font-semibold scale-100"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => updateOption("isWholeWord", !options.isWholeWord)}
                title="Match Whole Word (Alt+W)"
                className={cn(
                  "size-4.5 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-pointer transition-all duration-120 active:scale-90",
                  options.isWholeWord
                    ? "bg-primary text-primary-foreground shadow-2xs font-semibold scale-100"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                \b
              </button>
              <button
                type="button"
                onClick={() => updateOption("isRegex", !options.isRegex)}
                title="Use Regular Expression (Alt+R)"
                className={cn(
                  "size-4.5 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-pointer transition-all duration-120 active:scale-90",
                  options.isRegex
                    ? "bg-primary text-primary-foreground shadow-2xs font-semibold scale-100"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                .*
              </button>
            </div>
          </div>
        </div>

        {/* Replace input row */}
        {isReplaceOpen && (
          <div className="flex items-center gap-1.5 pl-4 w-full animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace..."
              className="h-6.5 flex-1 min-w-0 rounded border border-sidebar-border/80 bg-background/50 px-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring font-sans transition-colors"
            />
            <button
              type="button"
              disabled={totalMatches === 0 || isReplacing}
              onClick={requestReplaceAll}
              title="Replace All"
              className="h-6.5 px-2.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-all duration-120 active:scale-95 shadow-2xs shrink-0"
            >
              Replace All
            </button>
          </div>
        )}

        {/* Filters Toggle Button */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="flex items-center gap-1 text-muted-foreground hover:text-sidebar-foreground cursor-pointer shrink-0 transition-colors active:scale-95"
          >
            <HugeiconsIcon icon={FilterIcon} className="size-3" />
            <span>{showFilters ? "Hide include/exclude" : "Filter files"}</span>
          </button>
          {query.trim() && (
            <span className="truncate max-w-[120px] text-right font-mono text-[10px] text-muted-foreground animate-kairo-pop" title={`${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${results.length} file${results.length !== 1 ? "s" : ""}`}>
              {totalMatches} match{totalMatches !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        {/* Expandable Include / Exclude Inputs */}
        {showFilters && (
          <div className="flex flex-col gap-1.5 pt-1 text-xs animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out">
            <div>
              <label className="text-[10px] text-muted-foreground font-mono">files to include</label>
              <input
                type="text"
                value={options.includePattern}
                onChange={(e) => updateOption("includePattern", e.target.value)}
                placeholder="e.g. *.ts, src/**"
                className="h-6 w-full rounded border border-sidebar-border/80 bg-background/50 px-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring font-mono mt-0.5 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-mono">files to exclude</label>
              <input
                type="text"
                value={options.excludePattern}
                onChange={(e) => updateOption("excludePattern", e.target.value)}
                placeholder="e.g. *.test.ts, dist/**"
                className="h-6 w-full rounded border border-sidebar-border/80 bg-background/50 px-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring font-mono mt-0.5 transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results Tree View */}
      <div className="flex-1 overflow-y-auto p-1 text-xs">
        {error ? (
          <div className="p-3 text-destructive text-xs">{error}</div>
        ) : isSearching ? (
          <div className="flex items-center justify-center p-6 text-xs text-muted-foreground gap-2">
            <HugeiconsIcon icon={RefreshIcon} className="size-4 animate-spin text-sidebar-primary" />
            <span>Searching workspace...</span>
          </div>
        ) : results.length > 0 ? (
          <div className="flex flex-col gap-1">
            {results.map((file) => {
              const isExpanded = expandedFiles.has(file.filePath);
              return (
                <div key={file.filePath} className="flex flex-col">
                  {/* File Header Row */}
                  <div
                    onClick={() => toggleFileExpand(file.filePath)}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-sidebar-accent cursor-pointer group transition-all duration-120 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className={cn(
                          "size-3 text-muted-foreground shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isExpanded && "rotate-90"
                        )}
                      />
                      <FileIcon name={file.fileName} isDirectory={false} className="size-3.5 shrink-0" />
                      <span className="font-medium text-foreground truncate font-mono">
                        {file.fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px] font-mono">
                        {file.relativePath}
                      </span>
                    </div>

                    <span className="rounded-full bg-sidebar-accent/80 px-1.5 py-0.2 text-[10px] font-mono font-medium text-sidebar-accent-foreground shrink-0">
                      {file.matches.length}
                    </span>
                  </div>

                  {/* Match items inside this file */}
                  {isExpanded && (
                    <div className="flex flex-col pl-4 border-l border-sidebar-border ml-3 mt-0.5 animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out origin-top">
                      {file.matches.map((match, mIdx) => (
                        <SearchResultItem
                          key={`${match.filePath}:${match.lineNumber}:${match.column}:${mIdx}`}
                          match={match}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : query.trim() ? (
          <div className="p-6 text-center text-xs text-muted-foreground italic">
            No results found for &quot;{query}&quot;.
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {activeWorkspace
              ? "Type a query above to search files across the workspace."
              : "Open a workspace to search files."}
          </div>
        )}
      </div>

      <ReplaceConfirmModal />
    </div>
  );
}

