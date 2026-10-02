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
    isSplit,
    toggleSplitView,
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
    <div className="flex h-9 w-full items-center justify-between border-b border-border/70 bg-sidebar/50 dark:bg-sidebar/40 select-none overflow-hidden">
      {/* Scrollable Tab List */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className={cn(
          "flex flex-1 h-full items-center overflow-x-auto no-scrollbar transition-[padding] duration-150 ease-out",
          !open && "pl-11"
        )}
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
      <div className="flex items-center gap-0.5 px-2 shrink-0 border-l border-border/70 bg-sidebar/30 h-full">
        <button
          type="button"
          onClick={toggleSplitView}
          title={isSplit ? "Close Split Editor (Ctrl+\\)" : "Split Editor Right (Ctrl+\\)"}
          className={cn(
            "flex items-center justify-center size-6 rounded hover:bg-muted/60 cursor-pointer transition-colors duration-120 active:scale-95",
            isSplit ? "text-sidebar-primary bg-sidebar-accent/70" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
            <path d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM2 13V3h5v10H2zm12 0H8V3h6v10z" />
          </svg>
        </button>

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
