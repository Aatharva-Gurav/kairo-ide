"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { MIN_PANEL_HEIGHT } from "../store";

interface TerminalPanelResizerProps {
  height: number;
  onResize: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export function TerminalPanelResizer({
  height,
  onResize,
  minHeight = MIN_PANEL_HEIGHT,
  maxHeight,
  className,
}: TerminalPanelResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startY: number; startHeight: number }>({
    startY: 0,
    startHeight: 0,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        startY: e.clientY,
        startHeight: height,
      };
    },
    [height]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartRef.current.startY - e.clientY;
      const targetMax =
        maxHeight || (typeof window !== "undefined" ? window.innerHeight * 0.85 : 800);
      const computedHeight = Math.min(
        Math.max(dragStartRef.current.startHeight + deltaY, minHeight),
        targetMax
      );
      onResize(Math.round(computedHeight));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Trigger resize event so xterm instances and FitAddon recalculate terminal geometry
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
    };

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, maxHeight, minHeight, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize Terminal Panel"
      title="Drag to resize terminal panel"
      className={cn(
        "group absolute top-0 left-0 right-0 h-1.5 -translate-y-0.5 z-30 cursor-row-resize flex items-center justify-center transition-colors select-none",
        isDragging ? "bg-primary" : "hover:bg-primary/40 bg-transparent",
        className
      )}
    >
      <div
        className={cn(
          "h-0.5 w-10 rounded-full transition-all duration-140",
          isDragging
            ? "bg-primary-foreground opacity-90 scale-x-125"
            : "bg-muted-foreground/30 group-hover:bg-primary group-hover:scale-x-110"
        )}
      />
    </div>
  );
}
