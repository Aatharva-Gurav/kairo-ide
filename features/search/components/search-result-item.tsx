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
      className="flex items-center gap-2 px-3 py-1 hover:bg-muted/60 cursor-pointer rounded-xs text-xs font-mono select-none group transition-colors"
    >
      <span className="text-[11px] text-muted-foreground/80 w-8 shrink-0 text-right">
        {match.lineNumber}:
      </span>
      <div className="flex-1 truncate text-foreground/90">
        <span className="text-muted-foreground">{before}</span>
        <span className="bg-amber-500/30 text-amber-300 font-semibold rounded-xs px-0.5">
          {matchedText}
        </span>
        <span>{after}</span>
      </div>
    </div>
  );
}

