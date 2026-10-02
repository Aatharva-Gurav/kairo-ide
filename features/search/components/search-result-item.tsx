"use client";

import React from "react";
import { WorkspaceSearchMatch } from "@/lib/tauri-ipc";
import { useSearch } from "../store";

interface SearchResultItemProps {
  match: WorkspaceSearchMatch;
}

export function SearchResultItem({ match }: SearchResultItemProps) {
  const { navigateToMatch } = useSearch();

  // Extract preview around the match
  const colIdx = match.column - 1;
  const matchLen = match.matchLength;

  const before = match.lineContent.slice(0, colIdx).trimStart();
  const matchedText = match.lineContent.slice(colIdx, colIdx + matchLen);
  const after = match.lineContent.slice(colIdx + matchLen);

  return (
    <div
      onClick={() => navigateToMatch(match)}
      className="flex items-center gap-2 px-2.5 py-1 hover:bg-sidebar-accent/60 dark:hover:bg-sidebar-accent/50 cursor-pointer rounded-sm text-xs font-mono select-none group transition-colors duration-120 ease-out active:scale-[0.99]"
    >
      <span className="text-[11px] text-muted-foreground/60 group-hover:text-muted-foreground w-8 shrink-0 text-right select-none font-mono">
        {match.lineNumber}:
      </span>
      <div className="flex-1 truncate text-foreground/80 group-hover:text-foreground">
        <span className="text-muted-foreground">{before}</span>
        <span className="bg-amber-500/20 text-amber-900 dark:bg-amber-400/25 dark:text-amber-200 font-semibold rounded-xs px-0.5 border border-amber-500/30 dark:border-amber-400/30 transition-colors duration-120">
          {matchedText}
        </span>
        <span>{after}</span>
      </div>
    </div>
  );
}
