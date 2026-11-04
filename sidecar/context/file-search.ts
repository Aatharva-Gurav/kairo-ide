/**
 * Codebase Search Engine for Kairo Agent Workspace Intelligence.
 *
 * Provides fast, bounded search across workspace files:
 * - File-name fuzzy search
 * - Content regex/word search with line snippets & context
 * - Language-aware symbol discovery heuristics
 * - Relevance ranking prioritizing active file & open editors
 */
import fs from "node:fs";
import path from "node:path";
import { ExclusionsManager } from "./exclusions";
import type {
  CodebaseSearchResult,
  CodebaseSearchMatch,
} from "./types";

export interface ContentSearchOptions {
  isRegex?: boolean;
  wholeWord?: boolean;
  caseSensitive?: boolean;
  limit?: number;
  maxMatchesPerFile?: number;
}

export interface SymbolDefinition {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "enum" | "variable" | "constant";
  lineNumber: number;
  lineContent: string;
}

// Regex patterns for heuristic symbol discovery across major languages
const SYMBOL_PATTERNS: Array<{
  kind: SymbolDefinition["kind"];
  regex: RegExp;
  nameGroup: number;
}> = [
  // TS/JS export/function/class/interface/type
  {
    kind: "function",
    regex: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
    nameGroup: 1,
  },
  {
    kind: "class",
    regex: /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/,
    nameGroup: 1,
  },
  {
    kind: "interface",
    regex: /(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/,
    nameGroup: 1,
  },
  {
    kind: "type",
    regex: /(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/,
    nameGroup: 1,
  },
  {
    kind: "enum",
    regex: /(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/,
    nameGroup: 1,
  },
  {
    kind: "constant",
    regex: /(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*[:=]/,
    nameGroup: 1,
  },
  // Python def/class
  {
    kind: "function",
    regex: /^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/,
    nameGroup: 1,
  },
  {
    kind: "class",
    regex: /^\s*class\s+([A-Za-z0-9_]+)(?:\(.*\))?:/,
    nameGroup: 1,
  },
  // Rust fn/struct/enum/trait/type
  {
    kind: "function",
    regex: /^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/,
    nameGroup: 1,
  },
  {
    kind: "class",
    regex: /^\s*(?:pub(?:\([^)]+\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z0-9_]+)/,
    nameGroup: 1,
  },
  // Go func
  {
    kind: "function",
    regex: /^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/,
    nameGroup: 1,
  },
];

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".rb", ".php", ".swift", ".kt", ".scala",
]);

export class CodebaseSearchEngine {
  private readonly workspaceRoot: string;
  private readonly exclusions: ExclusionsManager;

  constructor(workspaceRoot: string, exclusions?: ExclusionsManager) {
    this.workspaceRoot = path.normalize(workspaceRoot);
    this.exclusions = exclusions || new ExclusionsManager(this.workspaceRoot);
  }

  /**
   * Fast file-name search with substring/prefix scoring.
   */
  public async searchFileName(
    pattern: string,
    limit = 20
  ): Promise<CodebaseSearchResult[]> {
    const q = pattern.trim().toLowerCase();
    if (!q) return [];

    const fileList = await this.listAllFiles();
    const scored: CodebaseSearchResult[] = [];

    for (const relPath of fileList) {
      const base = path.basename(relPath).toLowerCase();
      const normRel = relPath.toLowerCase();

      let score = 0;
      if (base === q) {
        score = 1000;
      } else if (base.startsWith(q)) {
        score = 800 - (base.length - q.length);
      } else if (base.includes(q)) {
        score = 500 - (base.length - q.length);
      } else if (normRel.includes(q)) {
        score = 300 - (normRel.length - q.length);
      }

      if (score > 0) {
        scored.push({
          filePath: path.join(this.workspaceRoot, relPath),
          relativePath: relPath.replace(/\\/g, "/"),
          score,
          matches: [],
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Content search across workspace files with line context snippets.
   */
  public async searchContent(
    query: string,
    options: ContentSearchOptions = {}
  ): Promise<CodebaseSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const limit = options.limit ?? 15;
    const maxMatchesPerFile = options.maxMatchesPerFile ?? 5;
    const isRegex = !!options.isRegex;
    const caseSensitive = !!options.caseSensitive;
    const wholeWord = !!options.wholeWord;

    let regex: RegExp;
    try {
      if (isRegex) {
        regex = new RegExp(q, caseSensitive ? "g" : "gi");
      } else {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
        regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
      }
    } catch {
      // Invalid regex fallback to literal match
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(escaped, caseSensitive ? "g" : "gi");
    }

    const fileList = await this.listAllFiles();
    const results: CodebaseSearchResult[] = [];

    for (const relPath of fileList) {
      if (results.length >= limit) break;

      const fullPath = path.join(this.workspaceRoot, relPath);
      let content: string;
      try {
        content = await fs.promises.readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      const matches: CodebaseSearchMatch[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        if (regex.test(line)) {
          const before = lines.slice(Math.max(0, i - 2), i);
          const after = lines.slice(i + 1, Math.min(lines.length, i + 3));

          matches.push({
            lineNumber: i + 1,
            lineContent: line.trimEnd(),
            contextBefore: before,
            contextAfter: after,
          });

          if (matches.length >= maxMatchesPerFile) break;
        }
      }

      if (matches.length > 0) {
        const snippet = matches
          .map((m) => `L${m.lineNumber}: ${m.lineContent}`)
          .join("\n");

        results.push({
          filePath: fullPath,
          relativePath: relPath.replace(/\\/g, "/"),
          score: 100 + matches.length * 10,
          matches,
          snippet,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Symbol search using language heuristic declaration regexes.
   */
  public async searchSymbols(
    symbolQuery: string,
    limit = 20
  ): Promise<CodebaseSearchResult[]> {
    const q = symbolQuery.trim().toLowerCase();
    if (!q) return [];

    const fileList = await this.listAllFiles();
    const results: CodebaseSearchResult[] = [];

    for (const relPath of fileList) {
      const ext = path.extname(relPath).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(this.workspaceRoot, relPath);
      let content: string;
      try {
        content = await fs.promises.readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const symPattern of SYMBOL_PATTERNS) {
          const match = symPattern.regex.exec(line);
          if (match && match[symPattern.nameGroup]) {
            const symName = match[symPattern.nameGroup];
            const symLower = symName.toLowerCase();

            if (symLower.includes(q)) {
              let score = 200;
              if (symLower === q) score = 1000;
              else if (symLower.startsWith(q)) score = 500;

              const before = lines.slice(Math.max(0, i - 1), i);
              const after = lines.slice(i + 1, Math.min(lines.length, i + 2));

              results.push({
                filePath: fullPath,
                relativePath: relPath.replace(/\\/g, "/"),
                score,
                symbolName: `${symPattern.kind} ${symName}`,
                matches: [
                  {
                    lineNumber: i + 1,
                    lineContent: line.trimEnd(),
                    contextBefore: before,
                    contextAfter: after,
                  },
                ],
                snippet: line.trim(),
              });
              break;
            }
          }
        }
      }

      if (results.length >= limit * 2) break;
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Adjusts result scores based on relevance to active file, open tabs, and query affinity.
   */
  public rankResults(
    results: CodebaseSearchResult[],
    activeFilePath?: string,
    openFilePaths?: string[]
  ): CodebaseSearchResult[] {
    const normActive = activeFilePath ? path.normalize(activeFilePath).toLowerCase() : undefined;
    const normOpen = new Set(
      (openFilePaths || []).map((p) => path.normalize(p).toLowerCase())
    );

    return results
      .map((item) => {
        let boost = 0;
        const normItemPath = path.normalize(item.filePath).toLowerCase();

        if (normActive && normItemPath === normActive) {
          boost += 80;
        } else if (normOpen.has(normItemPath)) {
          boost += 40;
        }

        // Depth penalty: favor shallower files slightly
        const depth = item.relativePath.split("/").length;
        const depthPenalty = Math.min(depth * 3, 30);

        return {
          ...item,
          score: item.score + boost - depthPenalty,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Traverses workspace directories up to max files/depth, skipping excluded paths.
   */
  public async listAllFiles(maxFiles = 5000, maxDepth = 10): Promise<string[]> {
    const results: string[] = [];

    const walk = async (currentDir: string, relativeDir: string, currentDepth: number) => {
      if (currentDepth > maxDepth || results.length >= maxFiles) {
        return;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxFiles) break;

        const relEntryPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          if (this.exclusions.isIgnoredDirectory(entry.name)) {
            continue;
          }
          if (this.exclusions.isSensitive(relEntryPath)) {
            continue;
          }
          await walk(
            path.join(currentDir, entry.name),
            relEntryPath,
            currentDepth + 1
          );
        } else if (entry.isFile()) {
          const { exclude } = this.exclusions.shouldExclude(relEntryPath);
          if (!exclude) {
            results.push(relEntryPath);
          }
        }
      }
    };

    await walk(this.workspaceRoot, "", 0);
    return results;
  }
}
