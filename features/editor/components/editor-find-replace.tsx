"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as monaco from "monaco-editor";
import {
  Replace as ReplaceIcon,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  GripHorizontal,
  CaseSensitive,
  WholeWord,
  Regex,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizePath } from "@/lib/tauri-ipc";

import { useEditor } from "../store";

interface EditorFindReplaceProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
  isOpen: boolean;
  isReplaceMode: boolean;
  onClose: () => void;
  onToggleReplaceMode: (mode?: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  initialQuery?: string;
  documentPath?: string;
}

const STORAGE_KEY = "kairo:editor_find_replace_pos";

export function EditorFindReplace({
  editor,
  isOpen,
  isReplaceMode,
  onClose,
  onToggleReplaceMode,
  containerRef,
  initialQuery = "",
  documentPath,
}: EditorFindReplaceProps) {
  const { updateContent, saveDocument, filesSettings } = useEditor();
  const [findText, setFindText] = useState(initialQuery);
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [matches, setMatches] = useState<monaco.editor.FindMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Position state within editor container
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 20, y: 12 });
  const [isDragging, setIsDragging] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decorationsCollectionRef = useRef<any>(null);

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
  }>({ startX: 0, startY: 0, posX: 0, posY: 0 });

  // Load and clamp saved position when opened or when container bounds change
  useEffect(() => {
    if (!isOpen) return;

    const clampAndSetPosition = () => {
      const container = containerRef.current;
      const widget = widgetRef.current;
      if (!container) return;

      const cRect = container.getBoundingClientRect();
      const widgetWidth = widget ? widget.offsetWidth : 390;
      const widgetHeight = widget ? widget.offsetHeight : (isReplaceMode ? 96 : 56);

      const maxX = Math.max(0, cRect.width - widgetWidth);
      const maxY = Math.max(0, cRect.height - widgetHeight);

      let targetX = maxX - 20; // default top-right
      let targetY = 12;

      const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            targetX = parsed.x;
            targetY = parsed.y;
          }
        } catch {
          // ignore corrupted storage
        }
      }

      setPosition({
        x: Math.max(0, Math.min(targetX, maxX)),
        y: Math.max(0, Math.min(targetY, maxY)),
      });
    };

    const timer = setTimeout(clampAndSetPosition, 20);
    return () => clearTimeout(timer);
  }, [isOpen, isReplaceMode, containerRef]);

  // Keep widget clamped when container resizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      const widget = widgetRef.current;
      if (!container || !widget) return;

      const cRect = container.getBoundingClientRect();
      const maxX = Math.max(0, cRect.width - widget.offsetWidth);
      const maxY = Math.max(0, cRect.height - widget.offsetHeight);

      setPosition((prev) => {
        const clampedX = Math.max(0, Math.min(prev.x, maxX));
        const clampedY = Math.max(0, Math.min(prev.y, maxY));
        if (clampedX !== prev.x || clampedY !== prev.y) {
          return { x: clampedX, y: clampedY };
        }
        return prev;
      });
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  // Prepopulate query from selection when opened
  useEffect(() => {
    if (!isOpen || !editor) return;

    let cancel = false;
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      const selText = editor.getModel()?.getValueInRange(selection);
      if (selText && selText.length < 300 && !selText.includes("\n")) {
        setTimeout(() => {
          if (!cancel) {
            setFindText(selText);
          }
        }, 0);
      }
    }

    const timer = setTimeout(() => {
      if (isReplaceMode && replaceInputRef.current) {
        replaceInputRef.current.focus();
        replaceInputRef.current.select();
      } else if (findInputRef.current) {
        findInputRef.current.focus();
        findInputRef.current.select();
      }
    }, 40);

    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [isOpen, isReplaceMode, editor]);

  // Core search and decoration logic
  const performSearch = useCallback(() => {
    if (!editor) return;
    const model = editor.getModel();
    if (!model || !findText) {
      setMatches([]);
      setActiveIndex(-1);
      if (decorationsCollectionRef.current) {
        decorationsCollectionRef.current.clear();
      }
      return;
    }

    try {
      const wordSeparators = editor.getOption(monaco.editor.EditorOption.wordSeparators);
      const found = model.findMatches(
        findText,
        false, // searchOnlyEditableRange (false = entire file)
        isRegex,
        matchCase,
        matchWholeWord ? wordSeparators : null,
        true, // captureMatches
        2000 // limit
      );

      setMatches(found);

      if (found.length > 0) {
        const curPos = editor.getPosition();
        let closestIdx = 0;
        if (curPos) {
          for (let i = 0; i < found.length; i++) {
            if (
              found[i].range.startLineNumber > curPos.lineNumber ||
              (found[i].range.startLineNumber === curPos.lineNumber &&
                found[i].range.startColumn >= curPos.column)
            ) {
              closestIdx = i;
              break;
            }
          }
        }
        setActiveIndex(closestIdx);
      } else {
        setActiveIndex(-1);
      }
    } catch {
      // Invalid regular expression or search error
      setMatches([]);
      setActiveIndex(-1);
      if (decorationsCollectionRef.current) {
        decorationsCollectionRef.current.clear();
      }
    }
  }, [editor, findText, isRegex, matchCase, matchWholeWord]);

  // Execute search whenever query, flags, or document changes
  useEffect(() => {
    if (!isOpen) {
      if (decorationsCollectionRef.current) {
        decorationsCollectionRef.current.clear();
      }
      return;
    }

    let isDisposed = false;
    const searchTimer = setTimeout(() => {
      if (!isDisposed) {
        performSearch();
      }
    }, 0);

    if (!editor) {
      return () => {
        isDisposed = true;
        clearTimeout(searchTimer);
      };
    }
    const model = editor.getModel();
    if (!model) {
      return () => {
        isDisposed = true;
        clearTimeout(searchTimer);
      };
    }

    const disposable = model.onDidChangeContent(() => {
      performSearch();
    });

    return () => {
      isDisposed = true;
      clearTimeout(searchTimer);
      disposable.dispose();
    };
  }, [isOpen, performSearch, editor]);

  // Update decorations and navigate to active match
  useEffect(() => {
    if (!isOpen || !editor) return;

    if (!decorationsCollectionRef.current) {
      decorationsCollectionRef.current = editor.createDecorationsCollection([]);
    }

    const decs = matches.map((m, idx) => ({
      range: m.range,
      options: {
        className: idx === activeIndex ? "kairo-find-match-current" : "kairo-find-match",
        overviewRuler: {
          color: idx === activeIndex ? "#f59e0b" : "#eab30880",
          position: monaco.editor.OverviewRulerLane.Right,
        },
        minimap: {
          color: idx === activeIndex ? "#f59e0b" : "#eab30880",
          position: monaco.editor.MinimapPosition.Inline,
        },
      },
    }));

    decorationsCollectionRef.current.set(decs);

    if (matches.length > 0 && activeIndex >= 0 && activeIndex < matches.length) {
      const targetMatch = matches[activeIndex];
      editor.revealRangeInCenterIfOutsideViewport(targetMatch.range);
      editor.setSelection(targetMatch.range);
    }
  }, [matches, activeIndex, isOpen, editor]);

  // Clear decorations on close
  const handleClose = useCallback(() => {
    if (decorationsCollectionRef.current) {
      decorationsCollectionRef.current.clear();
    }
    onClose();
    editor?.focus();
  }, [onClose, editor]);

  // Navigation handlers
  const handleNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const handlePrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // Replace handlers
  const handleReplace = useCallback(() => {
    if (!editor || matches.length === 0 || activeIndex < 0 || activeIndex >= matches.length) {
      return;
    }
    const current = matches[activeIndex];
    editor.executeEdits("kairo-find-replace", [
      { range: current.range, text: replaceText, forceMoveMarkers: true },
    ]);
    // Move cursor right past the replacement so subsequent search advances naturally
    editor.setPosition({
      lineNumber: current.range.startLineNumber,
      column: current.range.startColumn + replaceText.length,
    });

    const model = editor.getModel();
    if (model) {
      const val = model.getValue();
      const rawPath = documentPath || model.uri?.fsPath || model.uri?.path || "";
      if (rawPath) {
        const norm = normalizePath(rawPath);
        updateContent(norm, val);
        if (filesSettings.autoSave !== "off") {
          saveDocument(norm);
        }
      }
    }

    // Refresh search matches and decorations immediately
    requestAnimationFrame(() => {
      performSearch();
    });
  }, [editor, matches, activeIndex, replaceText, performSearch, updateContent, documentPath, filesSettings.autoSave, saveDocument]);

  const handleReplaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return;
    editor.executeEdits(
      "kairo-find-replace",
      matches.map((m) => ({
        range: m.range,
        text: replaceText,
        forceMoveMarkers: true,
      }))
    );

    const model = editor.getModel();
    if (model) {
      const val = model.getValue();
      const rawPath = documentPath || model.uri?.fsPath || model.uri?.path || "";
      if (rawPath) {
        const norm = normalizePath(rawPath);
        updateContent(norm, val);
        if (filesSettings.autoSave !== "off") {
          saveDocument(norm);
        }
      }
    }

    // Refresh search matches and decorations immediately
    requestAnimationFrame(() => {
      performSearch();
    });
  }, [editor, matches, replaceText, performSearch, updateContent, documentPath, filesSettings.autoSave, saveDocument]);

  // Dragging handlers (constrained strictly within the code editor container)
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      const widget = widgetRef.current;
      if (!container || !widget) return;

      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;

      const cRect = container.getBoundingClientRect();
      const maxX = Math.max(0, cRect.width - widget.offsetWidth);
      const maxY = Math.max(0, cRect.height - widget.offsetHeight);

      const nextX = Math.max(0, Math.min(dragStartRef.current.posX + deltaX, maxX));
      const nextY = Math.max(0, Math.min(dragStartRef.current.posY + deltaY, maxY));

      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setPosition((current) => {
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
          }
        } catch {
          // ignore storage error
        }
        return current;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, containerRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={widgetRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className={cn(
        "absolute z-30 flex flex-col gap-1.5 p-2 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md text-popover-foreground shadow-2xl text-xs select-none w-[410px] max-w-[calc(100%-16px)] transition-[box-shadow,border-color] duration-150 animate-in fade-in-0 zoom-in-95 origin-top-right",
        isDragging && "shadow-3xl border-primary/50 cursor-grabbing ring-1 ring-primary/30"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between px-1 py-0.5 cursor-grab active:cursor-grabbing border-b border-border/40 select-none text-muted-foreground hover:text-foreground"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground select-none pointer-events-none">
          <GripHorizontal className="size-3.5 opacity-60" />
          <span>{isReplaceMode ? "Find and Replace" : "Find"}</span>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/70 cursor-pointer transition-colors"
          title="Close (Escape)"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Find Input Row */}
      <div className="flex items-center gap-1 w-full">
        {/* Toggle Replace Mode Button */}
        <button
          type="button"
          onClick={() => onToggleReplaceMode(!isReplaceMode)}
          className={cn(
            "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors shrink-0",
            isReplaceMode && "text-foreground bg-accent/60"
          )}
          title="Toggle Replace (Ctrl+H)"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-150", isReplaceMode && "rotate-90")}
          />
        </button>

        {/* Find Input Box */}
        <div className="relative flex flex-1 items-center min-w-0">
          <input
            ref={findInputRef}
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  handlePrevMatch();
                } else {
                  handleNextMatch();
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleClose();
              } else if (e.altKey && e.key.toLowerCase() === "c") {
                e.preventDefault();
                setMatchCase((prev) => !prev);
              } else if (e.altKey && e.key.toLowerCase() === "w") {
                e.preventDefault();
                setMatchWholeWord((prev) => !prev);
              } else if (e.altKey && e.key.toLowerCase() === "r") {
                e.preventDefault();
                setIsRegex((prev) => !prev);
              }
            }}
            placeholder="Find..."
            className="w-full h-7 rounded-md border border-border/80 bg-background/90 pl-2 pr-18 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-ring font-mono shadow-2xs"
          />

          {/* Match Counter inside input box */}
          <span className="absolute right-1 text-[10.5px] text-muted-foreground font-mono select-none px-1 pointer-events-none">
            {findText
              ? matches.length > 0
                ? `${activeIndex + 1} of ${matches.length}`
                : "No results"
              : ""}
          </span>
        </div>

        {/* Match Modifiers (Case Sensitive, Whole Word, Regex) */}
        <div className="flex items-center gap-0.5 shrink-0 bg-background/40 p-0.5 rounded-md border border-border/50">
          <button
            type="button"
            onClick={() => setMatchCase(!matchCase)}
            className={cn(
              "p-1 rounded cursor-pointer transition-colors text-muted-foreground hover:text-foreground",
              matchCase
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "hover:bg-accent"
            )}
            title="Match Case (Alt+C)"
          >
            <CaseSensitive className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMatchWholeWord(!matchWholeWord)}
            className={cn(
              "p-1 rounded cursor-pointer transition-colors text-muted-foreground hover:text-foreground",
              matchWholeWord
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "hover:bg-accent"
            )}
            title="Match Whole Word (Alt+W)"
          >
            <WholeWord className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsRegex(!isRegex)}
            className={cn(
              "p-1 rounded cursor-pointer transition-colors text-muted-foreground hover:text-foreground",
              isRegex
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "hover:bg-accent"
            )}
            title="Use Regular Expression (Alt+R)"
          >
            <Regex className="size-3.5" />
          </button>
        </div>

        {/* Previous and Next Match Buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handlePrevMatch}
            disabled={matches.length === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            title="Previous Match (Shift+Enter)"
          >
            <ChevronUp className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={handleNextMatch}
            disabled={matches.length === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            title="Next Match (Enter)"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Replace Input Row (Visible in Replace Mode) */}
      {isReplaceMode && (
        <div className="flex items-center gap-1 w-full pt-1 border-t border-border/40 animate-in fade-in-0 duration-150">
          <div className="p-1 text-muted-foreground opacity-60 shrink-0">
            <ReplaceIcon className="size-3.5" />
          </div>

          <div className="flex flex-1 items-center min-w-0">
            <input
              ref={replaceInputRef}
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.ctrlKey || e.metaKey || e.altKey) {
                    handleReplaceAll();
                  } else {
                    handleReplace();
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  handleClose();
                }
              }}
              placeholder="Replace..."
              className="w-full h-7 rounded-md border border-border/80 bg-background/90 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-ring font-mono shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleReplace}
              disabled={matches.length === 0}
              className="h-6.5 px-2 text-[11px] cursor-pointer active:scale-95 transition-all"
              title="Replace current match (Enter)"
            >
              Replace
            </Button>

            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="h-6.5 px-2 text-[11px] cursor-pointer active:scale-95 transition-all"
              title="Replace all matches (Ctrl+Alt+Enter)"
            >
              Replace All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
