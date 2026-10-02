"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useEditor } from "../store";
import { useWorkspace } from "@/features/workspace/store";
import { listWorkspaceFiles, relativePath, basename } from "@/lib/tauri-ipc";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { fuzzyFilter } from "@/features/commands/fuzzy-search";

interface FileEntry {
  path: string;
  name: string;
  relativePath: string;
}

interface QuickOpenModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSwitchToCommandPalette?: (initialQuery?: string) => void;
}

export function QuickOpenModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  onSwitchToCommandPalette,
}: QuickOpenModalProps = {}) {
  const { isQuickOpenVisible, setQuickOpenVisible, openDocument } = useEditor();
  const { activeWorkspace } = useWorkspace();

  const isVisible = propIsOpen !== undefined ? propIsOpen : isQuickOpenVisible;

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    if (propOnClose) {
      propOnClose();
    } else {
      setQuickOpenVisible(false);
    }
  }, [propOnClose, setQuickOpenVisible]);

  // Fetch project files when modal opens
  useEffect(() => {
    if (!isVisible || !activeWorkspace) return;

    let isMounted = true;
    async function load() {
      try {
        if (!activeWorkspace) return;
        const list = await listWorkspaceFiles(activeWorkspace.rootPath);
        if (isMounted) {
          const mapped: FileEntry[] = list.map((p) => ({
            path: p,
            name: basename(p),
            relativePath: relativePath(activeWorkspace.rootPath, p),
          }));
          setFiles(mapped);
        }
      } catch (err) {
        console.warn("[QuickOpen] Error loading workspace files:", err);
      }
    }

    load();

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => {
      isMounted = false;
    };
  }, [isVisible, activeWorkspace]);

  // If user types '>' at start, switch to Command Palette
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.startsWith(">")) {
      handleClose();
      if (onSwitchToCommandPalette) {
        onSwitchToCommandPalette(val.slice(1).trim());
      }
      return;
    }
    setQuery(val);
    setSelectedIndex(0);
  };

  // Filter files using fuzzy matching
  const filteredFiles = useMemo(() => {
    const clean = query.trim();
    if (!clean) return files.slice(0, 50);

    return fuzzyFilter(files, clean, (f) => [f.name, f.relativePath]).slice(0, 50);
  }, [files, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredFiles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        openDocument(filteredFiles[selectedIndex].path);
        handleClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isVisible) return null;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-xs pt-[12vh] px-4 animate-in fade-in-0 duration-150 ease-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-border/80 bg-popover/98 shadow-2xl overflow-hidden flex flex-col max-h-[60vh] text-popover-foreground animate-in zoom-in-95 slide-in-from-top-3 duration-150 delay-subtle ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-3.5 border-b border-border/70 bg-popover/80 backdrop-blur-sm">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-muted-foreground/70 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a file name to open (or '>' for commands)..."
            className="h-10 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none font-sans"
          />
          <kbd className="kbd-shortcut">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 text-xs">
          {filteredFiles.length > 0 ? (
            filteredFiles.map((file, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={file.path}
                  onClick={() => {
                    openDocument(file.path);
                    handleClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`relative flex items-center justify-between px-3 py-2 rounded-md cursor-pointer select-none transition-colors duration-100 ease-out active:scale-[0.99] ${
                    isSelected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs before:absolute before:left-0.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-primary before:rounded-full"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <FileIcon
                      name={file.name}
                      isDirectory={false}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate font-mono">{file.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground/80 truncate max-w-[220px] font-mono">
                    {file.relativePath}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              {activeWorkspace ? "No matching files found." : "Open a workspace to search files."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
