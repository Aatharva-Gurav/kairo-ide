"use client";

import React, { useEffect, useRef } from "react";
import { Scissors, Copy, ClipboardPaste } from "lucide-react";

interface EditorContextMenuProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function EditorContextMenu({
  editor,
  isOpen,
  x,
  y,
  onClose,
  containerRef,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

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

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);

    let scrollDisposable: { dispose: () => void } | undefined;
    if (editor?.onDidScrollChange) {
      scrollDisposable = editor.onDidScrollChange(onClose);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      scrollDisposable?.dispose();
    };
  }, [isOpen, onClose, editor]);

  if (!isOpen || !editor) return null;

  const menuWidth = 165;
  const menuHeight = 110;
  const container = containerRef?.current;
  const cRect = container ? container.getBoundingClientRect() : null;
  const maxX = cRect ? Math.max(0, cRect.width - menuWidth - 4) : 400;
  const maxY = cRect ? Math.max(0, cRect.height - menuHeight - 4) : 400;

  const clampedX = Math.max(4, Math.min(x, maxX));
  const clampedY = Math.max(4, Math.min(y, maxY));

  const handleCut = async () => {
    onClose();
    if (!editor) return;
    editor.focus();

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      const text = editor.getModel()?.getValueInRange(selection);
      if (text) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          }
        } catch {
          // ignore clipboard errors
        }
      }
      editor.executeEdits("contextmenu-cut", [
        { range: selection, text: "", forceMoveMarkers: true },
      ]);
      return;
    }

    editor.trigger("contextmenu", "editor.action.clipboardCutAction", null);
  };

  const handleCopy = async () => {
    onClose();
    if (!editor) return;
    editor.focus();

    const selection = editor.getSelection();
    let text = "";
    if (selection && !selection.isEmpty()) {
      text = editor.getModel()?.getValueInRange(selection) || "";
    } else {
      const pos = editor.getPosition();
      if (pos) {
        text = (editor.getModel()?.getLineContent(pos.lineNumber) || "") + "\n";
      }
    }

    if (text) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch {
        // ignore clipboard write errors
      }
    }

    editor.trigger("contextmenu", "editor.action.clipboardCopyAction", null);
  };

  const handlePaste = async () => {
    onClose();
    if (!editor) return;
    editor.focus();

    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const selection = editor.getSelection();
          if (selection) {
            editor.executeEdits("contextmenu-paste", [
              { range: selection, text, forceMoveMarkers: true },
            ]);
            return;
          }
        }
      }
    } catch {
      // Fallback to Monaco paste trigger
    }

    editor.trigger("contextmenu", "editor.action.clipboardPasteAction", null);
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: `${clampedX}px`,
        top: `${clampedY}px`,
        boxShadow: "var(--shadow-elevation-high, 0 16px 36px -4px rgba(0, 0, 0, 0.45))",
      }}
      className="absolute z-40 min-w-[160px] max-w-[190px] rounded-lg border border-border/80 bg-popover/98 backdrop-blur-md p-1 text-popover-foreground text-xs select-none shadow-2xl animate-in fade-in-0 zoom-in-95 duration-120 ease-out origin-top-left"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleCut}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
      >
        <div className="flex items-center gap-2">
          <Scissors className="size-3.5 text-muted-foreground" />
          <span>Cut</span>
        </div>
        <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+X</kbd>
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
      >
        <div className="flex items-center gap-2">
          <Copy className="size-3.5 text-muted-foreground" />
          <span>Copy</span>
        </div>
        <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+C</kbd>
      </button>

      <button
        type="button"
        onClick={handlePaste}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-100"
      >
        <div className="flex items-center gap-2">
          <ClipboardPaste className="size-3.5 text-muted-foreground" />
          <span>Paste</span>
        </div>
        <kbd className="kbd-shortcut font-mono text-[9px] text-muted-foreground/80">Ctrl+V</kbd>
      </button>
    </div>
  );
}
