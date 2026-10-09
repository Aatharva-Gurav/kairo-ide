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
              data-floating-fab="true"
              aria-label={isOpen ? "Cancel creation" : "Create file or folder"}
              aria-expanded={isOpen}
              tabIndex={isVisible ? 0 : -1}
              className={cn(
                "relative z-40 flex items-center justify-center size-10 rounded-full cursor-pointer select-none",
                // 3D Physical Surface, Layered Shadows, and Inset Specular Highlight
                "bg-primary text-primary-foreground border border-white/25 dark:border-white/18",
                "shadow-[0_4px_12px_rgba(0,0,0,0.2),0_1.5px_3px_rgba(0,0,0,0.12),inset_0_1px_1px_0_rgba(255,255,255,0.45)]",
                "dark:shadow-[0_6px_18px_rgba(0,0,0,0.65),0_2px_4px_rgba(0,0,0,0.45),inset_0_1px_1px_0_rgba(255,255,255,0.22)]",
                // Hover: upward translation and deeper shadow
                "hover:-translate-y-0.5 hover:brightness-105",
                "hover:shadow-[0_6px_16px_rgba(0,0,0,0.25),0_2px_5px_rgba(0,0,0,0.15),inset_0_1px_1.5px_0_rgba(255,255,255,0.55)]",
                "dark:hover:shadow-[0_8px_22px_rgba(0,0,0,0.75),0_3px_6px_rgba(0,0,0,0.5),inset_0_1px_1.5px_0_rgba(255,255,255,0.3)]",
                // Active: pressed down mechanical state
                "active:translate-y-0.5 active:scale-95",
                "active:shadow-[0_1.5px_4px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.2)]",
                // Focus ring
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                // Smooth animations on sidebar toggle and reduced-motion compliance
                "transition-all duration-200 ease-out active:duration-75 motion-reduce:transition-none motion-reduce:transform-none",
                isVisible
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto animate-in fade-in-0 zoom-in-75 duration-200"
                  : "opacity-0 scale-75 translate-y-3 pointer-events-none"
              )}
            >
              <div
                className={cn(
                  "transition-transform duration-200 ease-out flex items-center justify-center",
                  isOpen ? "rotate-45" : "rotate-0"
                )}
              >
                <Plus className="size-4.5 stroke-[2.25]" />
              </div>
            </button>
          }
        />
        {isVisible && (
          <TooltipContent side="left" sideOffset={10}>
            {isOpen ? "Cancel (Esc)" : "Create file or folder"}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});
