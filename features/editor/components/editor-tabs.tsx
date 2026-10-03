"use client";

import React, { useRef } from "react";
import { useEditor } from "../store";
import { EditorTab } from "./editor-tab";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { FloppyDiskIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

export function EditorTabs() {
  const { open } = useSidebar();
  const {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    closeDocument,
    saveAllDocuments,
    closeAllDocuments,
  } = useEditor();

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Wheel horizontal scroll on tabs
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const hasDirtyDocuments = documents.some((d) => d.isDirty);

  return (
    <div className="relative z-20 shrink-0 flex h-9 w-full items-center justify-between border-b border-border/70 bg-sidebar/50 dark:bg-sidebar/40 select-none overflow-hidden">
      {/* Scrollable Tab List */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="flex flex-1 h-full items-center overflow-x-auto no-scrollbar"
      >
        {documents.map((doc) => (
          <EditorTab
            key={doc.id}
            document={doc}
            isActive={doc.id === activeDocumentId}
            onSelect={() => setActiveDocumentId(doc.id)}
            onClose={() => closeDocument(doc.id)}
          />
        ))}
      </div>

      {/* Tab Toolbar Actions */}
      <div
        className={cn(
          "flex items-center gap-0.5 px-2 shrink-0 border-l border-border/70 bg-sidebar/30 h-full transition-[margin] duration-150 ease-out",
          !open && "mr-11"
        )}
      >
        {hasDirtyDocuments && (
          <button
            type="button"
            onClick={() => saveAllDocuments()}
            title="Save All (Ctrl+Shift+S)"
            className="flex items-center justify-center size-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} className="size-3.5 text-sidebar-primary" />
          </button>
        )}

        <button
          type="button"
          onClick={() => closeAllDocuments()}
          title="Close All Tabs"
          className="flex items-center justify-center size-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
