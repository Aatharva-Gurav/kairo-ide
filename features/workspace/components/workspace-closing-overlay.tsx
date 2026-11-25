"use client";

import React from "react";
import { useWorkspace } from "../store";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceClosingOverlayProps {
  className?: string;
}

export function WorkspaceClosingOverlay({ className }: WorkspaceClosingOverlayProps) {
  const { lifecycleState, closingStage, targetWorkspaceName } = useWorkspace();

  const isVisible = lifecycleState === "CLOSING" || lifecycleState === "SWITCHING";

  if (!isVisible) {
    return null;
  }

  const isSwitching = lifecycleState === "SWITCHING";

  const getProgress = () => {
    if (!closingStage) return isSwitching ? 60 : 25;
    if (closingStage.includes("terminal")) return 25;
    if (closingStage.includes("editor")) return 50;
    if (closingStage.includes("filesystem") || closingStage.includes("watcher")) return 75;
    if (closingStage.includes("Releasing") || closingStage.includes("resource") || closingStage.includes("Finalizing")) return 100;
    return 65;
  };
  const progress = getProgress();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isSwitching ? "Switching workspace" : "Closing workspace"}
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-background/80 backdrop-blur-md select-none",
        "animate-in fade-in-0 duration-180 ease-out",
        className
      )}
    >
      <div
        className={cn(
          "relative flex flex-col items-center justify-center p-6 rounded-2xl",
          "border border-border/80 bg-card/95 text-card-foreground shadow-2xl",
          "max-w-sm w-full mx-4 text-center",
          "animate-in zoom-in-[0.98] duration-200 ease-out"
        )}
      >
        {/* Animated Process Indicator */}
        <div className="relative mb-3 flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
          <Loader2 className="size-6 animate-spin stroke-[2.25]" />
        </div>

        {/* Title */}
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {isSwitching ? (
            targetWorkspaceName ? (
              <>Switching to <span className="text-primary font-bold">{targetWorkspaceName}</span>...</>
            ) : (
              "Switching Workspace..."
            )
          ) : (
            "Closing Workspace..."
          )}
        </h2>

        {/* Supporting description (VS Code exact message) */}
        <p className="text-xs text-muted-foreground mt-1 max-w-[280px] leading-relaxed">
          Stopping processes and releasing workspace resources.
        </p>

        {/* Real Dynamic Cleanup Stages */}
        <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/50 text-[11px] font-mono text-muted-foreground w-full justify-center truncate">
          <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="truncate">
            {closingStage || (isSwitching ? "Preparing workspace..." : "Cleaning up resources...")}
          </span>
        </div>

        {/* Dynamic progress bar */}
        <div className="w-full h-1.5 bg-muted/60 rounded-full mt-3 overflow-hidden relative">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
