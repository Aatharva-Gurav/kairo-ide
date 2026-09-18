"use client";

import React from "react";
import { useEditor } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon, Search01Icon, Folder01Icon } from "@hugeicons/core-free-icons";

export function EditorEmptyState() {
  const { setQuickOpenVisible } = useEditor();

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center select-none bg-background">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-sidebar-accent/50 text-sidebar-primary mb-4 border border-border">
        <HugeiconsIcon icon={CodeIcon} className="size-7" />
      </div>

      <h2 className="text-base font-semibold text-foreground">No File Open</h2>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
        Select a file from the explorer on the left or use keyboard shortcuts to quickly navigate your project.
      </p>

      {/* Keyboard Shortcuts Reference */}
      <div className="mt-6 flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-xs max-w-sm w-full">
        <div
          onClick={() => setQuickOpenVisible(true)}
          className="flex items-center justify-between py-1 cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
            <span>Quick Open File</span>
          </div>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-foreground font-semibold">
            Ctrl + P
          </kbd>
        </div>

        <div className="flex items-center justify-between py-1 text-muted-foreground">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
            <span>Find in Workspace</span>
          </div>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-foreground font-semibold">
            Ctrl + Shift + F
          </kbd>
        </div>

        <div className="flex items-center justify-between py-1 text-muted-foreground">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CodeIcon} className="size-3.5" />
            <span>Format Document</span>
          </div>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-foreground font-semibold">
            Shift + Alt + F
          </kbd>
        </div>
      </div>
    </div>
  );
}

