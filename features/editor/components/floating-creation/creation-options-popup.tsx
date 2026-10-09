"use client";

import React, { useEffect, useRef } from "react";
import { FilePlus, FolderPlus, ArrowRight } from "lucide-react";
import { CreationType } from "./types";
import { cn } from "@/lib/utils";

interface CreationOptionsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: CreationType) => void;
}

export function CreationOptionsPopup({
  isOpen,
  onClose,
  onSelectType,
}: CreationOptionsPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Use pointerdown with delay or mousedown
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute bottom-16 right-0 z-40 w-64 p-1.5 rounded-2xl",
        "bg-popover/95 text-popover-foreground border border-border/80 shadow-2xl backdrop-blur-xl",
        "ring-1 ring-black/5 dark:ring-white/10 select-none",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 duration-150 ease-out"
      )}
    >
      <div className="px-2.5 py-1.5 mb-1 border-b border-border/50">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          Create Item
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {/* Option: New File */}
        <button
          type="button"
          onClick={() => onSelectType("file")}
          className={cn(
            "group flex items-center gap-3 w-full p-2.5 rounded-xl cursor-pointer text-left",
            "hover:bg-primary/10 hover:text-primary transition-all duration-140 active:scale-[0.98]",
            "border border-transparent hover:border-primary/20"
          )}
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-140 shrink-0 shadow-2xs">
            <FilePlus className="size-4.5" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-semibold tracking-tight leading-tight">
              New File
            </span>
            <span className="text-[10px] text-muted-foreground group-hover:text-foreground/80 leading-snug">
              Create a document in workspace
            </span>
          </div>
          <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
        </button>

        {/* Option: New Folder */}
        <button
          type="button"
          onClick={() => onSelectType("folder")}
          className={cn(
            "group flex items-center gap-3 w-full p-2.5 rounded-xl cursor-pointer text-left",
            "hover:bg-primary/10 hover:text-primary transition-all duration-140 active:scale-[0.98]",
            "border border-transparent hover:border-primary/20"
          )}
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-140 shrink-0 shadow-2xs">
            <FolderPlus className="size-4.5" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-semibold tracking-tight leading-tight">
              New Folder
            </span>
            <span className="text-[10px] text-muted-foreground group-hover:text-foreground/80 leading-snug">
              Create a directory in workspace
            </span>
          </div>
          <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
        </button>
      </div>
    </div>
  );
}

