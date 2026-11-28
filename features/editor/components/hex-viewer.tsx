"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EditorDocument } from "../types";
import {
  readBinaryChunk,
  searchBinaryFile,
  formatBytes,
  copyToClipboard,
  getDetailedMetadata,
} from "@/lib/tauri-ipc";
import {
  BYTES_PER_ROW,
  formatHexOffset,
  formatHexByte,
  toPrintableAscii,
  parseOffsetInput,
  parseHexSearchQuery,
  encodeTextSearchQuery,
  formatSelectionAsHex,
  formatSelectionAsAscii,
} from "../services/hex-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Copy,
  RefreshCw,
  ArrowUpToLine,
  ArrowDownToLine,
  Eye,
  EyeOff,
  AlertCircle,
  Lock,
} from "lucide-react";

const PAGE_SIZE = 65_536; // 64 KiB per paged chunk
const MAX_CACHED_PAGES = 32; // 2 MiB max cached in memory
const ROW_HEIGHT = 24;
const OVERSCAN_ROWS = 10;

interface HexViewerProps {
  document: EditorDocument;
}

interface TabHexState {
  scrollTop: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  showAscii: boolean;
  searchMode: "hex" | "text";
  searchQuery: string;
}

const tabStateMap = new Map<string, TabHexState>();

export function HexViewer({ document }: HexViewerProps) {
  const initial = tabStateMap.get(document.id);

  const [totalSize, setTotalSize] = useState<number>(document.fileSize ?? 0);
  const [readonly, setReadonly] = useState<boolean>(Boolean(document.readonly));
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [showAscii, setShowAscii] = useState<boolean>(initial?.showAscii ?? true);
  const [selectionStart, setSelectionStart] = useState<number | null>(
    initial?.selectionStart ?? null
  );
  const [selectionEnd, setSelectionEnd] = useState<number | null>(
    initial?.selectionEnd ?? null
  );

  // Search state
  const [searchMode, setSearchMode] = useState<"hex" | "text">(initial?.searchMode ?? "hex");
  const [searchQuery, setSearchQuery] = useState<string>(initial?.searchQuery ?? "");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Go to offset
  const [offsetInput, setOffsetInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Virtualization & LRU page cache
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState<number>(initial?.scrollTop ?? 0);
  const [viewportHeight, setViewportHeight] = useState<number>(480);
  const [pages, setPages] = useState<Record<number, number[]>>({});
  const pageOrderRef = useRef<number[]>([]);
  const inflightPagesRef = useRef<Set<number>>(new Set());

  // Persist per-tab state (bounded to 100 entries)
  useEffect(() => {
    if (tabStateMap.size >= 100 && !tabStateMap.has(document.id)) {
      const oldest = tabStateMap.keys().next().value;
      if (oldest !== undefined) tabStateMap.delete(oldest);
    }
    tabStateMap.set(document.id, {
      scrollTop,
      selectionStart,
      selectionEnd,
      showAscii,
      searchMode,
      searchQuery,
    });
  }, [document.id, scrollTop, selectionStart, selectionEnd, showAscii, searchMode, searchQuery]);

  // Initial page load on mount or explicit refresh
  useEffect(() => {
    let cancelled = false;
    pageOrderRef.current = [];
    inflightPagesRef.current.clear();

    readBinaryChunk(document.path, 0, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setTotalSize(res.totalSize);
        setReadonly(res.readonly);
        setError(null);
        pageOrderRef.current = [0];
        setPages({ 0: res.bytes });
        setIsLoadingMeta(false);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        try {
          const meta = await getDetailedMetadata(document.path);
          if (!cancelled && meta.size === 0) {
            setTotalSize(0);
            setError(null);
            setPages({});
            setIsLoadingMeta(false);
            return;
          }
        } catch {
          // ignore
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Unable to read binary file.");
        setIsLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.path, refreshTick]);

  // Observe viewport height for virtualization
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    if (initial?.scrollTop && el.scrollTop !== initial.scrollTop) {
      el.scrollTop = initial.scrollTop;
    }
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 480;
      setViewportHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [initial?.scrollTop]);

  const totalRows = Math.ceil(totalSize / BYTES_PER_ROW);
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRowCount);

  // Fetch any missing pages covering visible rows
  const ensurePage = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0) return;
      if (pages[pageIndex] !== undefined || inflightPagesRef.current.has(pageIndex)) return;
      const pageOffset = pageIndex * PAGE_SIZE;
      if (pageOffset >= totalSize) return;

      inflightPagesRef.current.add(pageIndex);
      readBinaryChunk(document.path, pageOffset, PAGE_SIZE)
        .then((res) => {
          inflightPagesRef.current.delete(pageIndex);
          setPages((prev) => {
            const next = { ...prev, [pageIndex]: res.bytes };
            const order = pageOrderRef.current.filter((p) => p !== pageIndex);
            order.push(pageIndex);
            while (order.length > MAX_CACHED_PAGES) {
              const evicted = order.shift();
              if (evicted !== undefined) delete next[evicted];
            }
            pageOrderRef.current = order;
            return next;
          });
        })
        .catch(() => {
          inflightPagesRef.current.delete(pageIndex);
        });
    },
    [document.path, totalSize, pages]
  );

  useEffect(() => {
    if (totalSize === 0) return;
    const startByte = startRow * BYTES_PER_ROW;
    const endByte = Math.min(totalSize, endRow * BYTES_PER_ROW);
    const firstPage = Math.floor(startByte / PAGE_SIZE);
    const lastPage = Math.floor(Math.max(0, endByte - 1) / PAGE_SIZE);
    for (let p = firstPage; p <= lastPage; p++) {
      ensurePage(p);
    }
  }, [startRow, endRow, totalSize, ensurePage]);

  const getByteAt = useCallback(
    (absOffset: number): number | null => {
      const pageIdx = Math.floor(absOffset / PAGE_SIZE);
      const page = pages[pageIdx];
      if (!page) return null;
      const inPage = absOffset - pageIdx * PAGE_SIZE;
      return inPage >= 0 && inPage < page.length ? page[inPage] : null;
    },
    [pages]
  );

  const selMin =
    selectionStart !== null && selectionEnd !== null
      ? Math.min(selectionStart, selectionEnd)
      : selectionStart;
  const selMax =
    selectionStart !== null && selectionEnd !== null
      ? Math.max(selectionStart, selectionEnd)
      : selectionStart;

  const getSelectedBytes = useCallback(async (): Promise<number[]> => {
    if (selMin === null || selMax === null) return [];
    const len = Math.min(selMax - selMin + 1, 65_536);
    const collected: number[] = [];
    let missing = false;
    for (let i = 0; i < len; i++) {
      const b = getByteAt(selMin + i);
      if (b === null) {
        missing = true;
        break;
      }
      collected.push(b);
    }
    if (!missing) return collected;
    const chunk = await readBinaryChunk(document.path, selMin, len);
    return chunk.bytes;
  }, [selMin, selMax, getByteAt, document.path]);

  const scrollToOffset = useCallback(
    (offset: number) => {
      const clamped = Math.max(0, Math.min(offset, Math.max(0, totalSize - 1)));
      const row = Math.floor(clamped / BYTES_PER_ROW);
      const targetTop = Math.max(0, row * ROW_HEIGHT - viewportHeight / 3);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = targetTop;
      }
      setScrollTop(targetTop);
      setSelectionStart(clamped);
      setSelectionEnd(clamped);
    },
    [totalSize, viewportHeight]
  );

  const handleGoToOffset = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseOffsetInput(offsetInput);
    if (parsed !== null && totalSize > 0) {
      scrollToOffset(parsed);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearchError(null);
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setActiveMatchIdx(-1);
      return;
    }

    let bytes: number[] | null = null;
    if (searchMode === "hex") {
      bytes = parseHexSearchQuery(searchQuery);
      if (!bytes) {
        setSearchError("Invalid hex bytes (e.g. 89 50 4E 47)");
        return;
      }
    } else {
      bytes = encodeTextSearchQuery(searchQuery);
    }

    setIsSearching(true);
    try {
      const res = await searchBinaryFile(document.path, bytes, 500);
      setSearchMatches(res.offsets);
      setSearchTruncated(res.truncated);
      if (res.offsets.length > 0) {
        setActiveMatchIdx(0);
        scrollToOffset(res.offsets[0]);
      } else {
        setActiveMatchIdx(-1);
      }
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const jumpMatch = (delta: number) => {
    if (searchMatches.length === 0) return;
    const nextIdx =
      (activeMatchIdx + delta + searchMatches.length) % searchMatches.length;
    setActiveMatchIdx(nextIdx);
    scrollToOffset(searchMatches[nextIdx]);
  };

  const triggerCopy = async (kind: "hex" | "ascii" | "range" | "offset") => {
    setContextMenu(null);
    if (selMin === null) return;
    if (kind === "offset") {
      await copyToClipboard(`0x${formatHexOffset(selMin)}`);
      setCopyFeedback("Offset copied");
      setTimeout(() => setCopyFeedback(null), 1500);
      return;
    }
    const bytes = await getSelectedBytes();
    if (bytes.length === 0) return;

    const text =
      kind === "hex"
        ? formatSelectionAsHex(bytes)
        : kind === "ascii"
          ? formatSelectionAsAscii(bytes)
          : `0x${formatHexOffset(selMin)}..0x${formatHexOffset(selMax ?? selMin)}: ${formatSelectionAsHex(bytes)}`;

    await copyToClipboard(text);
    setCopyFeedback(`Copied ${bytes.length}B`);
    setTimeout(() => setCopyFeedback(null), 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (totalSize === 0) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "c" && selMin !== null) {
      e.preventDefault();
      triggerCopy("hex").catch(() => {});
      return;
    }

    const cur = selectionEnd ?? selectionStart ?? 0;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(totalSize - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowDown") next = Math.min(totalSize - 1, cur + BYTES_PER_ROW);
    else if (e.key === "ArrowUp") next = Math.max(0, cur - BYTES_PER_ROW);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = totalSize - 1;

    if (next !== null) {
      e.preventDefault();
      if (e.shiftKey && selectionStart !== null) {
        setSelectionEnd(next);
      } else {
        setSelectionStart(next);
        setSelectionEnd(next);
      }
      const row = Math.floor(next / BYTES_PER_ROW);
      const rowTop = row * ROW_HEIGHT;
      const el = scrollContainerRef.current;
      if (el) {
        if (rowTop < el.scrollTop) el.scrollTop = rowTop;
        else if (rowTop + ROW_HEIGHT > el.scrollTop + viewportHeight) {
          el.scrollTop = rowTop + ROW_HEIGHT - viewportHeight;
        }
      }
    }
  };

  const activeMatchOffset =
    activeMatchIdx >= 0 && activeMatchIdx < searchMatches.length
      ? searchMatches[activeMatchIdx]
      : null;

  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-background">
        <div className="max-w-md rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-destructive">
          <AlertCircle className="size-6 mx-auto mb-2" />
          <h3 className="text-sm font-semibold">Cannot open binary file</h3>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="mt-3 cursor-pointer"
          >
            <RefreshCw className="size-3 mr-1" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setContextMenu(null)}
      className="flex flex-1 flex-col h-full w-full overflow-hidden bg-background outline-none relative select-none"
    >
      {/* Compact Binary Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-3 py-1.5 text-xs shrink-0">
        {/* Search Controls */}
        <form onSubmit={handleSearch} className="flex items-center gap-1.5">
          <div className="flex items-center rounded border border-border/70 bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setSearchMode(searchMode === "hex" ? "text" : "hex")}
              className="px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase bg-muted/60 text-muted-foreground hover:text-foreground border-r border-border/60 cursor-pointer"
              title="Toggle Hex / UTF-8 Text Search"
            >
              {searchMode}
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === "hex" ? "Hex (e.g. 89 50 4E 47)" : "Search text..."}
              className="h-6 w-40 bg-transparent px-2 text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-1.5 h-6 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Find matches"
            >
              <Search className="size-3" />
            </button>
          </div>

          {searchMatches.length > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] font-mono text-muted-foreground">
              <span>
                {activeMatchIdx + 1}/{searchMatches.length}
                {searchTruncated ? "+" : ""}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => jumpMatch(-1)}
                className="size-5 cursor-pointer"
                title="Previous match"
              >
                <ChevronUp className="size-3" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => jumpMatch(1)}
                className="size-5 cursor-pointer"
                title="Next match"
              >
                <ChevronDown className="size-3" />
              </Button>
            </div>
          )}
          {searchError && (
            <span className="text-[11px] text-destructive">{searchError}</span>
          )}
        </form>

        {/* Offset Navigation & Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <form onSubmit={handleGoToOffset} className="flex items-center gap-1">
            <input
              type="text"
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
              placeholder="Offset (0x...)"
              className="h-6 w-24 rounded border border-border/70 bg-background px-2 text-[11px] font-mono text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <Button type="submit" size="xs" variant="outline" className="h-6 text-[11px] cursor-pointer">
              Go
            </Button>
          </form>

          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => scrollToOffset(0)}
            title="Jump to beginning"
            className="size-6 cursor-pointer"
          >
            <ArrowUpToLine className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => scrollToOffset(Math.max(0, totalSize - 1))}
            title="Jump to end"
            className="size-6 cursor-pointer"
          >
            <ArrowDownToLine className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => setShowAscii((v) => !v)}
            title={showAscii ? "Hide ASCII column" : "Show ASCII column"}
            className="size-6 cursor-pointer"
          >
            {showAscii ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={selMin === null}
            onClick={() => triggerCopy("hex")}
            title="Copy selected hex bytes"
            className="size-6 cursor-pointer"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => setRefreshTick((t) => t + 1)}
            title="Refresh"
            className="size-6 cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex items-center gap-4 border-b border-border/60 bg-muted/30 px-4 py-1 text-[11px] font-mono text-muted-foreground shrink-0">
        <span className="w-20 shrink-0">Offset</span>
        <span className="w-[392px] shrink-0">
          00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F
        </span>
        {showAscii && <span className="hidden md:inline-block">ASCII</span>}
      </div>

      {/* Virtualized Hex Grid */}
      {isLoadingMeta ? (
        <div className="flex flex-1 items-center justify-center text-xs font-mono text-muted-foreground">
          Loading binary stream...
        </div>
      ) : totalSize === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs font-mono text-muted-foreground">
          Empty file (0 bytes)
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="flex-1 overflow-auto font-mono text-xs"
        >
          <div
            style={{ height: `${totalRows * ROW_HEIGHT}px`, position: "relative" }}
            className="min-w-[660px]"
          >
            {Array.from({ length: Math.max(0, endRow - startRow) }, (_, i) => {
              const rowIndex = startRow + i;
              const rowOffset = rowIndex * BYTES_PER_ROW;
              const rowBytes: Array<number | null> = [];
              for (let col = 0; col < BYTES_PER_ROW; col++) {
                const abs = rowOffset + col;
                rowBytes.push(abs < totalSize ? getByteAt(abs) : null);
              }

              return (
                <div
                  key={rowIndex}
                  style={{
                    position: "absolute",
                    top: `${rowIndex * ROW_HEIGHT}px`,
                    height: `${ROW_HEIGHT}px`,
                    left: 0,
                    right: 0,
                  }}
                  className="flex items-center gap-4 px-4 hover:bg-muted/25"
                >
                  {/* Byte Offset */}
                  <span className="w-20 shrink-0 text-muted-foreground select-all">
                    {formatHexOffset(rowOffset)}
                  </span>

                  {/* Hex Bytes */}
                  <div className="flex items-center w-[392px] shrink-0">
                    {rowBytes.map((b, col) => {
                      const abs = rowOffset + col;
                      const isPresent = abs < totalSize;
                      const isSelected =
                        isPresent && selMin !== null && selMax !== null && abs >= selMin && abs <= selMax;
                      const isMatch = isPresent && matchSet.has(abs);
                      const isActiveMatch = isPresent && activeMatchOffset === abs;

                      return (
                        <span
                          key={col}
                          onMouseDown={(e) => {
                            if (!isPresent || e.button !== 0) return;
                            if (e.shiftKey && selectionStart !== null) {
                              setSelectionEnd(abs);
                            } else {
                              setSelectionStart(abs);
                              setSelectionEnd(abs);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (!isPresent) return;
                            e.preventDefault();
                            if (selMin === null || selMax === null || abs < selMin || abs > selMax) {
                              setSelectionStart(abs);
                              setSelectionEnd(abs);
                            }
                            setContextMenu({ x: e.clientX, y: e.clientY });
                          }}
                          className={cn(
                            "inline-block w-[23px] text-center rounded-xs cursor-pointer transition-colors",
                            col === 7 && "mr-2",
                            !isPresent && "opacity-0 pointer-events-none",
                            isSelected && "bg-primary text-primary-foreground font-semibold",
                            !isSelected && isActiveMatch && "bg-amber-500/40 text-foreground ring-1 ring-amber-500",
                            !isSelected && !isActiveMatch && isMatch && "bg-amber-500/20 text-foreground"
                          )}
                        >
                          {b === null ? ".." : formatHexByte(b)}
                        </span>
                      );
                    })}
                  </div>

                  {/* ASCII Column */}
                  {showAscii && (
                    <div className="hidden md:flex items-center text-foreground/85">
                      {rowBytes.map((b, col) => {
                        const abs = rowOffset + col;
                        const isPresent = abs < totalSize;
                        const isSelected =
                          isPresent && selMin !== null && selMax !== null && abs >= selMin && abs <= selMax;
                        return (
                          <span
                            key={col}
                            onMouseDown={(e) => {
                              if (!isPresent || e.button !== 0) return;
                              if (e.shiftKey && selectionStart !== null) {
                                setSelectionEnd(abs);
                              } else {
                                setSelectionStart(abs);
                                setSelectionEnd(abs);
                              }
                            }}
                            className={cn(
                              "inline-block w-[8.5px] text-center cursor-pointer",
                              !isPresent && "opacity-0 pointer-events-none",
                              isSelected && "bg-primary text-primary-foreground font-semibold"
                            )}
                          >
                            {b === null ? " " : toPrintableAscii(b)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info Bar */}
      <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-3 py-1 text-[11px] font-mono text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" /> Read-only{readonly ? " (Disk)" : ""}
          </span>
          <span>Size: {formatBytes(totalSize)} ({totalSize.toLocaleString()} B)</span>
          {selMin !== null && (
            <span>
              Offset: 0x{formatHexOffset(selMin)}
              {selMax !== null && selMax > selMin
                ? ` (${selMax - selMin + 1} bytes selected)`
                : ""}
            </span>
          )}
        </div>
        {copyFeedback && (
          <span className="text-primary font-medium">{copyFeedback}</span>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            top: Math.min(contextMenu.y, typeof window !== "undefined" ? window.innerHeight - 160 : contextMenu.y),
            left: Math.min(contextMenu.x, typeof window !== "undefined" ? window.innerWidth - 200 : contextMenu.x),
          }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[180px] rounded-lg border border-border/80 bg-popover p-1 shadow-xl text-popover-foreground text-xs"
        >
          <button
            type="button"
            onClick={() => triggerCopy("hex")}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer"
          >
            Copy Hexadecimal Values
          </button>
          <button
            type="button"
            onClick={() => triggerCopy("ascii")}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer"
          >
            Copy ASCII Representation
          </button>
          <button
            type="button"
            onClick={() => triggerCopy("range")}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer"
          >
            Copy Selected Byte Range
          </button>
          <button
            type="button"
            onClick={() => triggerCopy("offset")}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-accent cursor-pointer"
          >
            Copy Byte Offset
          </button>
        </div>
      )}
    </div>
  );
}
