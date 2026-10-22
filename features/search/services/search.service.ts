import {
  searchWorkspaceFiles,
  replaceInWorkspaceFiles,
  normalizePath,
  relativePath,
  basename,
  FileReplacementPayload,
  ReplaceSummary,
  WorkspaceSearchMatch,
} from "@/lib/tauri-ipc";
import { SearchOptions, FileSearchResult } from "../types";

export class SearchService {
  /**
   * Parses comma- or semicolon-separated pattern strings into an array of trimmed patterns.
   */
  static parsePatterns(patternStr: string): string[] {
    if (!patternStr || !patternStr.trim()) return [];
    return patternStr
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /**
   * Executes workspace search across active workspace root and groups results by file.
   */
  static async search(
    rootPath: string,
    query: string,
    options: SearchOptions
  ): Promise<FileSearchResult[]> {
    if (!query || !query.trim() || !rootPath) {
      return [];
    }

    if (options.isRegex) {
      try {
        new RegExp(query);
      } catch (err) {
        throw new Error(
          `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const includePatterns = this.parsePatterns(options.includePattern);
    const excludePatterns = this.parsePatterns(options.excludePattern);

    const matches: WorkspaceSearchMatch[] = await searchWorkspaceFiles(rootPath, query, {
      isCaseSensitive: options.isCaseSensitive,
      isWholeWord: options.isWholeWord,
      isRegex: options.isRegex,
      includePatterns,
      excludePatterns,
      maxResults: 5000,
    });

    const fileMap = new Map<string, WorkspaceSearchMatch[]>();
    for (const match of matches) {
      const normPath = normalizePath(match.filePath);
      if (!fileMap.has(normPath)) {
        fileMap.set(normPath, []);
      }
      fileMap.get(normPath)!.push(match);
    }

    const results: FileSearchResult[] = [];
    fileMap.forEach((fileMatches, filePath) => {
      results.push({
        filePath,
        fileName: basename(filePath),
        relativePath: relativePath(rootPath, filePath),
        matches: fileMatches,
      });
    });

    // Sort files alphabetically by relative path
    results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return results;
  }

  /**
   * Executes workspace replacements via backend engine.
   */
  static async replaceAll(
    replacements: FileReplacementPayload[]
  ): Promise<ReplaceSummary> {
    if (!replacements || replacements.length === 0) {
      return { filesModified: 0, occurrencesReplaced: 0 };
    }
    // Sort replacements bottom-to-top (descending line), then right-to-left (descending column)
    const sorted = [...replacements].sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      if (a.lineNumber !== b.lineNumber) {
        return b.lineNumber - a.lineNumber;
      }
      return b.column - a.column;
    });
    return await replaceInWorkspaceFiles(sorted);
  }
}
