"use client";

import React, { useEffect, useRef } from "react";
import {
  Copy,
  ClipboardPaste,
  CheckSquare,
  Search,
  Eraser,
  Trash2,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Edit2,
  Terminal,
} from "lucide-react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TerminalContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  type: "viewport" | "tab";
  sessionId: string;
  onCopy?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onFind?: () => void;
  onClear?: () => void;
  onClearBuffer?: () => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  onRename?: () => void;
  onKill?: () => void;
}

export function TerminalContextMenu({
  position,
  onClose,
  type,
  onCopy,
  onPaste,
  onSelectAll,
  onFind,
  onClear,
  onClearBuffer,
  onSplitHorizontal,
  onSplitVertical,
  onRename,
  onKill,
}: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  // Viewport boundary clamping
  const menuWidth = 200;
  const menuHeight = type === "viewport" ? 280 : 180;
  const clampedX =
    typeof window !== "undefined"
      ? Math.min(position.x, window.innerWidth - menuWidth - 8)
      : position.x;
  const clampedY =
    typeof window !== "undefined"
      ? Math.min(position.y, window.innerHeight - menuHeight - 8)
      : position.y;

  const handleAction = (action?: () => void) => {
    onClose();
    action?.();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        top: `${clampedY}px`,
        left: `${clampedX}px`,
        boxShadow: "var(--shadow-elevation-high, 0 10px 25px -5px rgba(0, 0, 0, 0.25))",
      }}
      className="fixed z-50 min-w-[195px] rounded-xl border border-border/80 bg-popover/98 backdrop-blur-md p-1 shadow-2xl text-xs text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left select-none"
    >
      {type === "viewport" ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onCopy)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <Copy className="size-3.5 text-muted-foreground" />
              <span>Copy</span>
            </div>
            <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
              Ctrl+C
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onPaste)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <ClipboardPaste className="size-3.5 text-muted-foreground" />
              <span>Paste</span>
            </div>
            <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
              Ctrl+V
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onSelectAll)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <CheckSquare className="size-3.5 text-muted-foreground" />
              <span>Select All</span>
            </div>
            <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
              Ctrl+A
            </span>
          </button>

          <div className="h-px bg-border/70 my-1 mx-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onFind)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <Search className="size-3.5 text-muted-foreground" />
              <span>Find...</span>
            </div>
            <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
              Ctrl+F
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onClear)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <Eraser className="size-3.5 text-muted-foreground" />
              <span>Clear Terminal</span>
            </div>
            <span className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">
              Ctrl+L
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onClearBuffer)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <Terminal className="size-3.5 text-muted-foreground" />
            <span>Clear Scrollback Buffer</span>
          </button>

          <div className="h-px bg-border/70 my-1 mx-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onSplitHorizontal)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="size-3.5 text-muted-foreground" />
              <span>Split Right</span>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onSplitVertical)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <SplitSquareVertical className="size-3.5 text-muted-foreground" />
              <span>Split Down</span>
            </div>
          </button>

          <div className="h-px bg-border/70 my-1 mx-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onKill)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/15 text-destructive hover:text-destructive cursor-pointer text-left transition-colors duration-100"
          >
            <Trash2 className="size-3.5" />
            <span>Kill Terminal Process</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onRename)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <Edit2 className="size-3.5 text-muted-foreground" />
            <span>Rename Terminal</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onSplitHorizontal)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <SplitSquareHorizontal className="size-3.5 text-muted-foreground" />
            <span>Split Terminal</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onClear)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer text-left transition-colors duration-100"
          >
            <Eraser className="size-3.5 text-muted-foreground" />
            <span>Clear Terminal</span>
          </button>

          <div className="h-px bg-border/70 my-1 mx-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => handleAction(onKill)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/15 text-destructive hover:text-destructive cursor-pointer text-left transition-colors duration-100"
          >
            <Trash2 className="size-3.5" />
            <span>Kill Terminal</span>
          </button>
        </>
      )}
    </div>
  );
}
