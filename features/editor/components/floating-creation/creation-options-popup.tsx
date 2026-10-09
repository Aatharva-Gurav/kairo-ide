"use client";

import React, { useEffect, useRef } from "react";
import { FilePlus, FolderPlus } from "lucide-react";
import { CreationType } from "./types";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
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

  // Close on Escape or click outside (ignoring clicks on the main FAB)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const isFabClick = Boolean(
        (e.target as HTMLElement)?.closest?.('[data-floating-fab="true"]')
      );
      if (isFabClick) {
        // Allow the main FAB's own click listener to toggle/close
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
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
      className="absolute bottom-12 right-0 w-10 z-40 flex flex-col items-center gap-2 select-none"
    >
      <TooltipProvider delay={150}>
        {/* Circular Option 2: New Folder (Same size as main button, no text) */}
        <div
          className={cn(
            "flex items-center justify-center cursor-pointer",
            "animate-in fade-in-0 zoom-in-50 slide-in-from-bottom-4 duration-200 delay-50 ease-out fill-mode-both"
          )}
          onClick={() => onSelectType("folder")}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Create New Folder"
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full cursor-pointer",
                    // Same size & 3D elevated surface as main button
                    "bg-card text-foreground border border-border/80",
                    "shadow-[0_4px_12px_rgba(0,0,0,0.18),0_1.5px_3px_rgba(0,0,0,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.4)]",
                    "dark:shadow-[0_6px_18px_rgba(0,0,0,0.65),0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_1px_0_rgba(255,255,255,0.2)]",
                    "hover:bg-primary hover:text-primary-foreground hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-lg",
                    "active:scale-95 active:translate-y-0",
                    "transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  )}
                >
                  <FolderPlus className="size-4.5 stroke-[2] transition-transform duration-140 group-hover:scale-110" />
                </button>
              }
            />
            <TooltipContent side="left" sideOffset={10}>
              New Folder
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Circular Option 1: New File (Same size as main button, no text) */}
        <div
          className={cn(
            "flex items-center justify-center cursor-pointer",
            "animate-in fade-in-0 zoom-in-50 slide-in-from-bottom-2 duration-150 ease-out fill-mode-both"
          )}
          onClick={() => onSelectType("file")}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Create New File"
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full cursor-pointer",
                    // Same size & 3D elevated surface as main button
                    "bg-card text-foreground border border-border/80",
                    "shadow-[0_4px_12px_rgba(0,0,0,0.18),0_1.5px_3px_rgba(0,0,0,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.4)]",
                    "dark:shadow-[0_6px_18px_rgba(0,0,0,0.65),0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_1px_0_rgba(255,255,255,0.2)]",
                    "hover:bg-primary hover:text-primary-foreground hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-lg",
                    "active:scale-95 active:translate-y-0",
                    "transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  )}
                >
                  <FilePlus className="size-4.5 stroke-[2] transition-transform duration-140 group-hover:scale-110" />
                </button>
              }
            />
            <TooltipContent side="left" sideOffset={10}>
              New File
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
