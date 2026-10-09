"use client";

import React from "react";
import { Plus } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FloatingCreationButtonProps {
  isVisible: boolean;
  isOpen: boolean;
  onClick: () => void;
  hasStatusBar?: boolean;
}

export const FloatingCreationButton = React.forwardRef<
  HTMLButtonElement,
  FloatingCreationButtonProps
>(function FloatingCreationButton(
  { isVisible, isOpen, onClick },
  ref
) {
  return (
    <TooltipProvider delay={250}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={ref}
              type="button"
              onClick={onClick}
              aria-label={isOpen ? "Close creation menu" : "Create file or folder"}
              aria-expanded={isOpen}
              tabIndex={isVisible ? 0 : -1}
              className={cn(
                "relative z-40 flex items-center justify-center size-13.5 rounded-full cursor-pointer select-none",
                // 3D Physical Surface, Layered Shadows, and Inset Specular Highlight
                "bg-primary text-primary-foreground border border-white/25 dark:border-white/18",
                "shadow-[0_6px_16px_rgba(0,0,0,0.22),0_2px_4px_rgba(0,0,0,0.14),inset_0_1.5px_1.5px_0_rgba(255,255,255,0.45)]",
                "dark:shadow-[0_8px_24px_rgba(0,0,0,0.7),0_2px_6px_rgba(0,0,0,0.5),inset_0_1.5px_1.5px_0_rgba(255,255,255,0.25)]",
                // Hover: upward translation and deeper shadow
                "hover:-translate-y-1 hover:brightness-105",
                "hover:shadow-[0_10px_24px_rgba(0,0,0,0.28),0_4px_8px_rgba(0,0,0,0.16),inset_0_1.5px_2px_0_rgba(255,255,255,0.55)]",
                "dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.8),0_4px_10px_rgba(0,0,0,0.6),inset_0_1.5px_2px_0_rgba(255,255,255,0.35)]",
                // Active: pressed down mechanical state
                "active:translate-y-0.5 active:scale-[0.96]",
                "active:shadow-[0_2px_6px_rgba(0,0,0,0.25),inset_0_1px_2px_rgba(0,0,0,0.2)]",
                // Focus ring
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                // Transitions and reduced-motion compliance
                "transition-all duration-200 ease-out active:duration-75 motion-reduce:transition-none motion-reduce:transform-none",
                // Visibility coordinated with sidebar
                isVisible
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-90 translate-y-3 pointer-events-none"
              )}
            >
              <div
                className={cn(
                  "transition-transform duration-200 ease-out flex items-center justify-center",
                  isOpen ? "rotate-45" : "rotate-0"
                )}
              >
                <Plus className="size-6 stroke-[2.25]" />
              </div>
            </button>
          }
        />
        {isVisible && !isOpen && (
          <TooltipContent side="left" sideOffset={10}>
            Create file or folder
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});
