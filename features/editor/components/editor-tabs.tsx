"use client";

import React, { useRef, useState, useEffect } from "react";
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
    isSplit,
    splitLayoutMode,
    splitDirection,
    openSplitRight,
    openSplitDown,
    openThreeColumnSplit,
    toggleSplitOrientation,
    swapSplitDocuments,
    setSplitRatioPreset,
    closeSplitView,
  } = useEditor();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  // Wheel horizontal scroll on tabs
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Close split menu on click outside or Escape
  useEffect(() => {
    if (!isSplitMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setIsSplitMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSplitMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSplitMenuOpen]);

  return (
    <div className="relative z-20 shrink-0 flex h-[35px] w-full items-center justify-between border-b border-border/80 bg-sidebar/50 dark:bg-[#18181b]/80 select-none backdrop-blur-xs">
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
          "relative flex items-center gap-1 px-2 shrink-0 border-l border-border/60 bg-sidebar/30 h-full transition-[margin] duration-150 ease-out",
          !open && "mr-11"
        )}
      >
        {/* Split Editor View Dropdown Button */}
        <div className="relative" ref={splitMenuRef}>
          <button
            type="button"
            onClick={() => setIsSplitMenuOpen((prev) => !prev)}
            title="Split Editor Options"
            aria-label="Split Editor Options"
            className={cn(
              "flex items-center justify-center size-6 rounded hover:bg-muted/70 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-120 active:scale-95",
              (isSplit || isSplitMenuOpen) && "bg-muted/60 text-foreground"
            )}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-3.5"
            >
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <path d="M8 2v12" />
            </svg>
          </button>

          {/* Horizontal Icon-Only Dropdown Toolbar */}
          {isSplitMenuOpen && (
            <div className="absolute right-0 top-8 z-50 flex flex-row items-center gap-0.5 rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-right">
              {/* Split Right (2 Columns) */}
              <button
                type="button"
                onClick={() => {
                  openSplitRight();
                  setIsSplitMenuOpen(false);
                }}
                title="Split Right (Ctrl+\)"
                aria-label="Split Right (Ctrl+\)"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors active:scale-95",
                  isSplit && splitLayoutMode === "split-right" && "bg-accent text-accent-foreground font-semibold"
                )}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM2 13V3h5.5v10H2zm6.5 0V3H14v10H8.5z" />
                </svg>
              </button>

              {/* Split Down (2 Rows) */}
              <button
                type="button"
                onClick={() => {
                  openSplitDown();
                  setIsSplitMenuOpen(false);
                }}
                title="Split Down (Ctrl+K Ctrl+\)"
                aria-label="Split Down (Ctrl+K Ctrl+\)"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors active:scale-95",
                  isSplit && splitLayoutMode === "split-down" && "bg-accent text-accent-foreground font-semibold"
                )}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM2 7.5h12V3H2v4.5zm0 5.5h12V8.5H2V13z" />
                </svg>
              </button>

              {/* Split 3 Columns */}
              <button
                type="button"
                onClick={() => {
                  openThreeColumnSplit();
                  setIsSplitMenuOpen(false);
                }}
                title="Split into 3 Columns"
                aria-label="Split into 3 Columns"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors active:scale-95",
                  isSplit && splitLayoutMode === "split-three" && "bg-accent text-accent-foreground font-semibold"
                )}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
                  <path d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM2 13V3h3.5v10H2zm4.5 0V3h3v10h-3zm4 0V3H14v10h-3.5z" />
                </svg>
              </button>

              <div className="w-px h-4.5 bg-border/70 mx-0.5 shrink-0" />

              {/* Flip Orientation */}
              <button
                type="button"
                disabled={!isSplit}
                onClick={() => {
                  toggleSplitOrientation();
                  setIsSplitMenuOpen(false);
                }}
                title={`Flip Layout (${splitDirection === "horizontal" ? "Columns → Rows" : "Rows → Columns"})`}
                aria-label="Flip Layout Orientation"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md transition-colors active:scale-95",
                  !isSplit
                    ? "opacity-30 cursor-not-allowed text-muted-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                )}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
                  <path d="M2 10.5h9a2.5 2.5 0 0 0 2.5-2.5V3M14 5.5l-2.5-2.5L9 5.5" />
                </svg>
              </button>

              {/* Swap Panes */}
              <button
                type="button"
                disabled={!isSplit}
                onClick={() => {
                  swapSplitDocuments();
                  setIsSplitMenuOpen(false);
                }}
                title="Swap Editor Panes"
                aria-label="Swap Editor Panes"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md transition-colors active:scale-95",
                  !isSplit
                    ? "opacity-30 cursor-not-allowed text-muted-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                )}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
                  <path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8L3 11l3 3" />
                </svg>
              </button>

              <div className="w-px h-4.5 bg-border/70 mx-0.5 shrink-0" />

              {/* Equalize Panes */}
              <button
                type="button"
                disabled={!isSplit}
                onClick={() => {
                  setSplitRatioPreset("equal");
                  setIsSplitMenuOpen(false);
                }}
                title="Equalize Panes (50% / 50%)"
                aria-label="Equalize Panes"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md transition-colors font-mono text-[11px] font-bold active:scale-95",
                  !isSplit
                    ? "opacity-30 cursor-not-allowed text-muted-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                )}
              >
                ½
              </button>

              <div className="w-px h-4.5 bg-border/70 mx-0.5 shrink-0" />

              {/* Close Split View */}
              <button
                type="button"
                disabled={!isSplit}
                onClick={() => {
                  closeSplitView();
                  setIsSplitMenuOpen(false);
                }}
                title="Close Split Editor (Ctrl+\)"
                aria-label="Close Split Editor"
                className={cn(
                  "flex items-center justify-center size-7 rounded-md transition-colors active:scale-95",
                  !isSplit
                    ? "opacity-30 cursor-not-allowed text-muted-foreground"
                    : "text-destructive hover:bg-destructive/15 cursor-pointer"
                )}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Close All Tabs Button */}
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
