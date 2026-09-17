"use client";

import React, { useRef, useEffect } from "react";
import { useFileExplorer } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

interface ExplorerFilterProps {
  onClose: () => void;
}

export function ExplorerFilter({ onClose }: ExplorerFilterProps) {
  const { filterQuery, setFilterQuery, matchingCount } = useFileExplorer();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (filterQuery) {
        setFilterQuery("");
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-sidebar-border bg-sidebar-accent/20 select-none">
      <div className="relative flex flex-1 items-center">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter files by name..."
          className="h-6 w-full rounded bg-background/80 pl-7 pr-14 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none ring-1 ring-border focus:ring-sidebar-ring"
        />
        {filterQuery && (
          <span className="absolute right-6 text-[10px] text-muted-foreground font-mono">
            {matchingCount > 0 ? `${matchingCount}` : "0"}
          </span>
        )}
        {filterQuery && (
          <button
            onClick={() => setFilterQuery("")}
            className="absolute right-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Clear filter"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        )}
      </div>

      <button
        onClick={() => {
          setFilterQuery("");
          onClose();
        }}
        className="p-1 rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
        title="Close filter (Esc)"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </div>
  );
}

