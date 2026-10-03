"use client";

import React, { useRef } from "react";
import { useEditor } from "../store";
import { EditorTab } from "./editor-tab";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

export function EditorTabs() {
  const { open } = useSidebar();
  const {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    closeDocument,
    closeAllDocuments,
  } = useEditor();

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Wheel horizontal scroll on tabs
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="relative z-20 shrink-0 flex h-[35px] w-full items-center justify-between border-b border-border/80 bg-sidebar/50 dark:bg-[#18181b]/80 select-none overflow-hidden backdrop-blur-xs">
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
          "flex items-center gap-0.5 px-2 shrink-0 border-l border-border/60 bg-sidebar/30 h-full transition-[margin] duration-150 ease-out",
          !open && "mr-11"
        )}
      >
        <button
          type="button"
          onClick={() => closeAllDocuments()}
          title="Close All Tabs"
          aria-label="Close All Tabs"
          className="flex items-center justify-center size-6 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
