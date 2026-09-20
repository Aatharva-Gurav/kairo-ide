"use client";

import React, { useEffect } from "react";
import { useEditor } from "../store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

export function CloseConfirmModal() {
  const { dirtyCloseCandidate, confirmDirtyClose } = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dirtyCloseCandidate) return;
      if (e.key === "Escape") {
        e.preventDefault();
        confirmDirtyClose("cancel");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirtyCloseCandidate, confirmDirtyClose]);

  if (!dirtyCloseCandidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150 ease-out">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-start gap-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-2xs">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Save changes to &quot;{dirtyCloseCandidate.title}&quot;?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your changes will be permanently lost if you don&apos;t save them before closing this tab.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => confirmDirtyClose("cancel")}
            className="cursor-pointer active:scale-95 transition-all duration-120"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => confirmDirtyClose("discard")}
            className="cursor-pointer active:scale-95 transition-all duration-120"
          >
            Don&apos;t Save
          </Button>
          <Button
            size="sm"
            onClick={() => confirmDirtyClose("save")}
            className="cursor-pointer font-medium active:scale-95 transition-all duration-120"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
