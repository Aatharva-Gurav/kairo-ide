"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { SearchOptions, FileSearchResult, DEFAULT_SEARCH_OPTIONS } from "./types";
import { SearchService } from "./services/search.service";
import { useWorkspace } from "@/features/workspace/store";
import { ideEvents } from "@/lib/events";
import { WorkspaceSearchMatch, FileReplacementPayload, readFileContent, normalizePath } from "@/lib/tauri-ipc";

export interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  replaceQuery: string;
  setReplaceQuery: (r: string) => void;
  isReplaceOpen: boolean;
  toggleReplaceOpen: () => void;
  options: SearchOptions;
  updateOption: <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => void;

  results: FileSearchResult[];
  totalMatches: number;
  isSearching: boolean;
  isReplacing: boolean;
  error: string | null;

  expandedFiles: Set<string>;
  toggleFileExpand: (filePath: string) => void;
  collapseAllFiles: () => void;
  expandAllFiles: () => void;

  performSearch: (searchQuery?: string) => Promise<void>;
  clearSearch: () => void;
  navigateToMatch: (match: WorkspaceSearchMatch) => void;

  isReplaceConfirmOpen: boolean;
  requestReplaceAll: () => void;
  confirmReplaceAll: () => Promise<void>;
  cancelReplaceAll: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

import { SettingsService } from "@/features/settings/services/settings.service";

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();

  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [options, setOptions] = useState<SearchOptions>(() => {
    try {
      const s = SettingsService.getEffectiveSettings()?.search;
      if (!s) return DEFAULT_SEARCH_OPTIONS;
      return {
        isCaseSensitive: Boolean(s.isCaseSensitive),
        isWholeWord: Boolean(s.isWholeWord),
        isRegex: Boolean(s.isRegex),
        includePattern: s.includePattern || "",
        excludePattern: s.excludePattern || "",
      };
    } catch {
      return DEFAULT_SEARCH_OPTIONS;
    }
  });

  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);

  const activeWorkspaceRef = useRef(activeWorkspace);
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const searchIdRef = useRef(0);

  const totalMatches = useMemo(() => {
    return results.reduce((sum, file) => sum + file.matches.length, 0);
  }, [results]);

  const updateOption = useCallback(
    <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleReplaceOpen = useCallback(() => {
    setIsReplaceOpen((prev) => !prev);
  }, []);

  const toggleFileExpand = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const collapseAllFiles = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  const expandAllFiles = useCallback(() => {
    setExpandedFiles(new Set(results.map((r) => r.filePath)));
  }, [results]);

  const performSearch = useCallback(
    async (overrideQuery?: string) => {
      const targetQuery = overrideQuery !== undefined ? overrideQuery : queryRef.current;
      const ws = activeWorkspaceRef.current;

      if (!ws || !targetQuery.trim()) {
        setResults([]);
        setExpandedFiles(new Set());
        return;
      }

      const searchId = ++searchIdRef.current;
      setIsSearching(true);
      setError(null);

      try {
        const searchResults = await SearchService.search(
          ws.rootPath,
          targetQuery,
          optionsRef.current
        );
        if (searchId !== searchIdRef.current) return;
        setResults(searchResults);
        // Expand all matching files by default
        setExpandedFiles(new Set(searchResults.map((r) => r.filePath)));
      } catch (err: unknown) {
        if (searchId !== searchIdRef.current) return;
        const msg = err instanceof Error ? err.message : "Search failed.";
        setError(msg);
      } finally {
        if (searchId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setExpandedFiles(new Set());
    setError(null);
  }, []);

  const navigateToMatch = useCallback((match: WorkspaceSearchMatch) => {
    ideEvents.emit("search:navigate-to-match", {
      path: match.filePath,
      line: match.lineNumber,
      column: match.column,
      matchLength: match.matchLength,
    });
  }, []);

  const requestReplaceAll = useCallback(() => {
    if (totalMatches === 0 || isReplacing) return;
    setIsReplaceConfirmOpen(true);
  }, [totalMatches, isReplacing]);

  const cancelReplaceAll = useCallback(() => {
    setIsReplaceConfirmOpen(false);
  }, []);

  const confirmReplaceAll = useCallback(async () => {
    if (results.length === 0) {
      setIsReplaceConfirmOpen(false);
      return;
    }

    setIsReplacing(true);
    setIsReplaceConfirmOpen(false);
    setError(null);

    try {
      const payload: FileReplacementPayload[] = [];

      for (const file of results) {
        for (const match of file.matches) {
          payload.push({
            filePath: match.filePath,
            lineNumber: match.lineNumber,
            column: match.column,
            matchLength: match.matchLength,
            replacement: replaceQuery,
          });
        }
      }

      await SearchService.replaceAll(payload);

      // Lively update all open documents affected by the replacement in real-time
      const affectedFiles = Array.from(new Set(payload.map((p) => normalizePath(p.filePath))));
      for (const filePath of affectedFiles) {
        try {
          const fresh = await readFileContent(filePath);
          if (!fresh.isBinary) {
            ideEvents.emit("file:content-changed", { path: filePath, content: fresh.content });
          }
        } catch {
          // Ignore read error
        }
      }

      // Re-run search to refresh updated state
      await performSearch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Replace failed.";
      setError(msg);
    } finally {
      setIsReplacing(false);
    }
  }, [results, replaceQuery, performSearch]);

  const value = useMemo(
    () => ({
      query,
      setQuery,
      replaceQuery,
      setReplaceQuery,
      isReplaceOpen,
      toggleReplaceOpen,
      options,
      updateOption,
      results,
      totalMatches,
      isSearching,
      isReplacing,
      error,
      expandedFiles,
      toggleFileExpand,
      collapseAllFiles,
      expandAllFiles,
      performSearch,
      clearSearch,
      navigateToMatch,
      isReplaceConfirmOpen,
      requestReplaceAll,
      confirmReplaceAll,
      cancelReplaceAll,
    }),
    [
      query,
      replaceQuery,
      isReplaceOpen,
      toggleReplaceOpen,
      options,
      updateOption,
      results,
      totalMatches,
      isSearching,
      isReplacing,
      error,
      expandedFiles,
      toggleFileExpand,
      collapseAllFiles,
      expandAllFiles,
      performSearch,
      clearSearch,
      navigateToMatch,
      isReplaceConfirmOpen,
      requestReplaceAll,
      confirmReplaceAll,
      cancelReplaceAll,
    ]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}

