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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in-0">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg text-card-foreground">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-500/10 p-2 text-amber-500 shrink-0">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              Save changes to &quot;{dirtyCloseCandidate.title}&quot;?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your changes will be permanently lost if you don&apos;t save them before closing this tab.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => confirmDirtyClose("cancel")}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => confirmDirtyClose("discard")}
          >
            Don&apos;t Save
          </Button>
          <Button
            size="sm"
            onClick={() => confirmDirtyClose("save")}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

