"use client";

import React from "react";
import { useEditor } from "../store";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon, Search01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";

export function EditorEmptyState() {
  const { setQuickOpenVisible } = useEditor();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center select-none bg-background animate-in fade-in-50 zoom-in-95 duration-200 delay-subtle">
      <div className="animate-kairo-float mb-3">
        <KairoBrandIcon size={48} className="rounded-xl shadow-lg hover:scale-105 transition-transform duration-200" />
      </div>

      <h2 className="text-base font-semibold tracking-tight text-foreground">No File Open</h2>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
        Select a file from the explorer on the left or use keyboard shortcuts to quickly navigate your project.
      </p>

      {/* Keyboard Shortcuts Reference */}
      <div className="mt-6 flex flex-col gap-1 text-xs max-w-xs w-full">
        <div
          onClick={() => setQuickOpenVisible(true)}
          className="group flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors duration-120 ease-out active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="font-medium">Quick Open File</span>
          </div>
          <kbd className="kbd-shortcut font-medium">
            Ctrl + P
          </kbd>
        </div>

        <div className="group flex items-center justify-between px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors duration-120">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Find in Workspace</span>
          </div>
          <kbd className="kbd-shortcut font-medium">
            Ctrl + Shift + F
          </kbd>
        </div>

        <div className="group flex items-center justify-between px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors duration-120">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CodeIcon} className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Format Document</span>
          </div>
          <kbd className="kbd-shortcut font-medium">
            Shift + Alt + F
          </kbd>
        </div>
      </div>
    </div>
  );
}
