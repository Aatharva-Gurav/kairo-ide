import { WorkspaceSearchMatch, SearchQueryOptions } from "@/lib/tauri-ipc";

export interface SearchOptions {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegex: boolean;
  includePattern: string;
  excludePattern: string;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  isCaseSensitive: false,
  isWholeWord: false,
  isRegex: false,
  includePattern: "",
  excludePattern: "",
};

export interface FileSearchResult {
  filePath: string;
  fileName: string;
  relativePath: string;
  matches: WorkspaceSearchMatch[];
}

export type { WorkspaceSearchMatch, SearchQueryOptions };

