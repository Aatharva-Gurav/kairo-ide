/**
 * Mentions Resolver for Kairo Workspace Intelligence.
 *
 * Parses and resolves inline mentions in prompts:
 * - @file:<path> or @file(<path>)
 * - @folder:<path> or @folder(<path>)
 * - @codebase or @codebase:<query>
 * - @selection
 * - @terminal
 * - @problems
 */
import fs from "node:fs";
import path from "node:path";
import type { WorkspaceContextPayload } from "../../lib/ai-agent/types";
import { ExclusionsManager } from "./exclusions";
import type { CodebaseSearchEngine } from "./file-search";
import type { ContextItem, ParsedMention, MentionType } from "./types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Regex to capture supported mentions:
// Examples:
// @file:src/index.ts or @file:"src/my file.ts" or @file(src/index.ts)
// @folder:src/components or @folder(src/components)
// @codebase or @codebase:auth or @codebase("auth")
// @selection
// @terminal
// @problems
const MENTION_REGEX = /@(file|folder|codebase|selection|terminal|problems)(?::(?:"([^"]+)"|'([^']+)'|([^\s]+))|\(([^)]+)\))?/gi;

export class MentionsResolver {
  private readonly workspaceRoot: string;
  private readonly exclusions: ExclusionsManager;

  constructor(workspaceRoot: string, exclusions?: ExclusionsManager) {
    this.workspaceRoot = path.normalize(workspaceRoot);
    this.exclusions = exclusions || new ExclusionsManager(this.workspaceRoot);
  }

  /**
   * Scans a prompt string and extracts all valid context mentions.
   */
  public parseMentions(prompt: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];
    if (!prompt) return mentions;

    let match: RegExpExecArray | null;
    const regex = new RegExp(MENTION_REGEX.source, "gi");

    while ((match = regex.exec(prompt)) !== null) {
      const typeStr = `@${match[1].toLowerCase()}` as MentionType;
      // query can be in group 2 (double quotes), group 3 (single quotes), group 4 (unquoted), or group 5 (parentheses)
      const query = match[2] || match[3] || match[4] || match[5] || undefined;

      mentions.push({
        type: typeStr,
        query: query ? query.trim() : undefined,
        raw: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return mentions;
  }

  /**
   * Resolves parsed mentions into structured ContextItems.
   */
  public async resolveMentions(
    mentions: ParsedMention[],
    options: {
      context?: WorkspaceContextPayload;
      searchEngine?: CodebaseSearchEngine;
    } = {}
  ): Promise<ContextItem[]> {
    const items: ContextItem[] = [];
    const seenFiles = new Set<string>();

    for (const mention of mentions) {
      switch (mention.type) {
        case "@file": {
          if (!mention.query) {
            // If bare @file, fallback to active editor file if available
            if (options.context?.activeDocument) {
              const item = this.resolveActiveFile(options.context.activeDocument);
              if (item && !seenFiles.has(item.id)) {
                seenFiles.add(item.id);
                items.push(item);
              }
            }
            break;
          }

          const fileItem = await this.resolveFileMention(mention.query, options.context);
          if (fileItem && !seenFiles.has(fileItem.id)) {
            seenFiles.add(fileItem.id);
            items.push(fileItem);
          }
          break;
        }

        case "@folder": {
          if (!mention.query) break;
          const folderItem = await this.resolveFolderMention(mention.query);
          if (folderItem) {
            items.push(folderItem);
          }
          break;
        }

        case "@selection": {
          const selItem = this.resolveSelectionMention(options.context);
          if (selItem) {
            items.push(selItem);
          }
          break;
        }

        case "@terminal": {
          const termItem = this.resolveTerminalMention(options.context);
          if (termItem) {
            items.push(termItem);
          }
          break;
        }

        case "@problems": {
          const probItem = this.resolveProblemsMention(options.context);
          if (probItem) {
            items.push(probItem);
          }
          break;
        }

        case "@codebase": {
          const cbItem = await this.resolveCodebaseMention(mention.query, options.searchEngine);
          if (cbItem) {
            items.push(cbItem);
          }
          break;
        }
      }
    }

    return items;
  }

  /**
   * Resolves a file mention. Uses in-memory editor content if file is dirty/open,
   * otherwise reads from disk. Enforces strict sensitive file exclusions.
   */
  private async resolveFileMention(
    targetPath: string,
    context?: WorkspaceContextPayload
  ): Promise<ContextItem | null> {
    const cleanTarget = targetPath.replace(/\\/g, "/").replace(/^\.\//, "");

    // 1. Check sensitive file exclusion
    if (this.exclusions.isSensitive(cleanTarget)) {
      return {
        id: `file-sensitive-${cleanTarget}`,
        section: "mentions",
        title: `File: ${cleanTarget} [EXCLUDED]`,
        filePath: cleanTarget,
        content: `[Security Warning: File '${cleanTarget}' matches sensitive credential/secret exclusions and cannot be attached to agent context.]`,
        tokenCount: 25,
        priority: 10,
      };
    }

    // 2. Check in-memory dirty active or open documents
    const normClean = path.normalize(cleanTarget).toLowerCase();

    if (context?.activeDocument) {
      const normActive = path.normalize(context.activeDocument.path).toLowerCase();
      if (normActive.endsWith(normClean) || normClean.endsWith(normActive)) {
        if (context.activeDocument.content !== undefined) {
          const content = context.activeDocument.content;
          return {
            id: `file-${cleanTarget}`,
            section: "mentions",
            title: `File: ${cleanTarget} (Editor Buffer${context.activeDocument.isDirty ? " - Unsaved" : ""})`,
            filePath: cleanTarget,
            content: `\`\`\`${context.activeDocument.language || ""}\n${content}\n\`\`\``,
            tokenCount: estimateTokens(content),
            priority: 90,
          };
        }
      }
    }

    if (context?.openDocuments) {
      for (const openDoc of context.openDocuments) {
        const normOpen = path.normalize(openDoc.path).toLowerCase();
        if (normOpen.endsWith(normClean) || normClean.endsWith(normOpen)) {
          if (openDoc.content !== undefined) {
            const content = openDoc.content;
            return {
              id: `file-${cleanTarget}`,
              section: "mentions",
              title: `File: ${cleanTarget} (Editor Buffer${openDoc.isDirty ? " - Unsaved" : ""})`,
              filePath: cleanTarget,
              content: `\`\`\`${openDoc.language || ""}\n${content}\n\`\`\``,
              tokenCount: estimateTokens(content),
              priority: 85,
            };
          }
        }
      }
    }

    // 3. Fallback: Read from disk
    const absolutePath = path.isAbsolute(cleanTarget)
      ? path.normalize(cleanTarget)
      : path.join(this.workspaceRoot, cleanTarget);

    // Verify it stays inside workspace
    if (!absolutePath.toLowerCase().startsWith(this.workspaceRoot.toLowerCase())) {
      return {
        id: `file-outside-${cleanTarget}`,
        section: "mentions",
        title: `File: ${cleanTarget} [ACCESS DENIED]`,
        filePath: cleanTarget,
        content: `[Access Denied: Path '${cleanTarget}' is outside the active workspace.]`,
        tokenCount: 20,
        priority: 10,
      };
    }

    const { exclude, reason } = this.exclusions.shouldExclude(cleanTarget);
    if (exclude) {
      return {
        id: `file-excluded-${cleanTarget}`,
        section: "mentions",
        title: `File: ${cleanTarget} [EXCLUDED]`,
        filePath: cleanTarget,
        content: `[Excluded from context: ${reason || "File filtered by exclusions policy."}]`,
        tokenCount: 20,
        priority: 10,
      };
    }

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (stat.isDirectory()) {
        return this.resolveFolderMention(cleanTarget);
      }
      if (this.exclusions.isOversized(stat.size)) {
        return {
          id: `file-oversized-${cleanTarget}`,
          section: "mentions",
          title: `File: ${cleanTarget} [OVERSIZED]`,
          filePath: cleanTarget,
          content: `[File '${cleanTarget}' exceeds 1MB limit (${stat.size} bytes).]`,
          tokenCount: 20,
          priority: 10,
        };
      }

      const raw = await fs.promises.readFile(absolutePath);
      if (this.exclusions.isBinaryFile(absolutePath, raw)) {
        return {
          id: `file-binary-${cleanTarget}`,
          section: "mentions",
          title: `File: ${cleanTarget} [BINARY]`,
          filePath: cleanTarget,
          content: `[Binary file '${cleanTarget}' cannot be displayed as text.]`,
          tokenCount: 20,
          priority: 10,
        };
      }

      const content = raw.toString("utf8");
      const ext = path.extname(cleanTarget).replace(".", "");
      return {
        id: `file-${cleanTarget}`,
        section: "mentions",
        title: `File: ${cleanTarget}`,
        filePath: cleanTarget,
        content: `\`\`\`${ext}\n${content}\n\`\`\``,
        tokenCount: estimateTokens(content),
        priority: 80,
      };
    } catch (err) {
      return {
        id: `file-notfound-${cleanTarget}`,
        section: "mentions",
        title: `File: ${cleanTarget} [NOT FOUND]`,
        filePath: cleanTarget,
        content: `[File not found: '${cleanTarget}']`,
        tokenCount: 15,
        priority: 5,
      };
    }
  }

  private resolveActiveFile(activeDoc: NonNullable<WorkspaceContextPayload["activeDocument"]>): ContextItem | null {
    if (!activeDoc.content) return null;
    const rel = path.relative(this.workspaceRoot, activeDoc.path).replace(/\\/g, "/");
    return {
      id: `file-active-${rel}`,
      section: "active_editor",
      title: `Active File: ${rel}${activeDoc.isDirty ? " (Unsaved Changes)" : ""}`,
      filePath: rel,
      content: `\`\`\`${activeDoc.language || ""}\n${activeDoc.content}\n\`\`\``,
      tokenCount: estimateTokens(activeDoc.content),
      priority: 95,
    };
  }

  /**
   * Resolves a folder mention by listing non-ignored contents up to depth 2.
   */
  private async resolveFolderMention(targetFolder: string): Promise<ContextItem | null> {
    const cleanFolder = targetFolder.replace(/\\/g, "/").replace(/^\.\//, "");
    const absolutePath = path.isAbsolute(cleanFolder)
      ? path.normalize(cleanFolder)
      : path.join(this.workspaceRoot, cleanFolder);

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isDirectory()) return null;

      const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
      const visible: string[] = [];

      for (const e of entries) {
        if (this.exclusions.isIgnoredDirectory(e.name)) continue;
        const rel = path.join(cleanFolder, e.name).replace(/\\/g, "/");
        if (this.exclusions.isSensitive(rel)) continue;

        visible.push(e.isDirectory() ? `${e.name}/` : e.name);
      }

      visible.sort();
      const content = `Folder structure of '${cleanFolder}':\n${visible.map((v) => `- ${v}`).join("\n")}`;

      return {
        id: `folder-${cleanFolder}`,
        section: "mentions",
        title: `Folder: ${cleanFolder}`,
        content,
        tokenCount: estimateTokens(content),
        priority: 70,
      };
    } catch {
      return {
        id: `folder-notfound-${cleanFolder}`,
        section: "mentions",
        title: `Folder: ${cleanFolder} [NOT FOUND]`,
        content: `[Folder not found: '${cleanFolder}']`,
        tokenCount: 15,
        priority: 5,
      };
    }
  }

  /**
   * Resolves @selection from the active editor document.
   */
  private resolveSelectionMention(context?: WorkspaceContextPayload): ContextItem | null {
    const activeDoc = context?.activeDocument;
    if (!activeDoc || !activeDoc.selection) {
      return {
        id: "selection-empty",
        section: "mentions",
        title: "Selected Code",
        content: "[No active code selection found in editor]",
        tokenCount: 15,
        priority: 20,
      };
    }

    const rel = path.relative(this.workspaceRoot, activeDoc.path).replace(/\\/g, "/");
    const cursorInfo = activeDoc.cursorPosition
      ? ` (Cursor at L${activeDoc.cursorPosition.line}:C${activeDoc.cursorPosition.column})`
      : "";
    const text = `Selected code in ${rel}${cursorInfo}:\n\`\`\`${activeDoc.language || ""}\n${activeDoc.selection}\n\`\`\``;

    return {
      id: "selection-active",
      section: "mentions",
      title: `Selection (${rel})`,
      content: text,
      tokenCount: estimateTokens(text),
      priority: 95,
    };
  }

  /**
   * Resolves @terminal from the context payload.
   */
  private resolveTerminalMention(context?: WorkspaceContextPayload): ContextItem | null {
    if (!context?.terminalOutput || !context.terminalOutput.trim()) {
      return {
        id: "terminal-empty",
        section: "mentions",
        title: "Terminal Output",
        content: "[Terminal buffer is empty]",
        tokenCount: 10,
        priority: 20,
      };
    }

    // Capture the last 50 lines of terminal output
    const lines = context.terminalOutput.split(/\r?\n/);
    const recentLines = lines.slice(-50).join("\n");
    const text = `Recent Terminal Output:\n\`\`\`text\n${recentLines}\n\`\`\``;

    return {
      id: "terminal-output",
      section: "mentions",
      title: "Terminal Output",
      content: text,
      tokenCount: estimateTokens(text),
      priority: 60,
    };
  }

  /**
   * Resolves @problems from diagnostics in the context payload.
   */
  private resolveProblemsMention(context?: WorkspaceContextPayload): ContextItem | null {
    const diagnostics = context?.diagnostics;
    if (!diagnostics || diagnostics.length === 0) {
      return {
        id: "problems-empty",
        section: "diagnostics",
        title: "Problems / Diagnostics",
        content: "No active problems or diagnostics reported.",
        tokenCount: 10,
        priority: 50,
      };
    }

    // Group by file
    const byFile = new Map<string, typeof diagnostics>();
    for (const diag of diagnostics) {
      const rel = path.relative(this.workspaceRoot, diag.filePath).replace(/\\/g, "/");
      const list = byFile.get(rel) || [];
      list.push(diag);
      byFile.set(rel, list);
    }

    const sections: string[] = [];
    for (const [filePath, items] of byFile.entries()) {
      sections.push(`### ${filePath}`);
      for (const item of items) {
        const sev = item.severity.toUpperCase();
        const src = item.source ? ` [${item.source}]` : "";
        sections.push(
          `- [${sev}] L${item.line}:C${item.column}: ${item.message}${src}`
        );
      }
    }

    const content = `Active Diagnostics & Problems:\n${sections.join("\n")}`;
    return {
      id: "problems-list",
      section: "diagnostics",
      title: "Problems & Diagnostics",
      content,
      tokenCount: estimateTokens(content),
      priority: 85,
    };
  }

  /**
   * Resolves @codebase or @codebase:<query>.
   */
  private async resolveCodebaseMention(
    query?: string,
    searchEngine?: CodebaseSearchEngine
  ): Promise<ContextItem | null> {
    if (query && searchEngine) {
      // Content search for query
      const results = await searchEngine.searchContent(query, { limit: 10 });
      if (results.length === 0) {
        return {
          id: `codebase-search-${query}`,
          section: "search_results",
          title: `Codebase Search: "${query}"`,
          content: `No codebase matches found for query: "${query}"`,
          tokenCount: 15,
          priority: 40,
        };
      }

      const formatted = results
        .map((r) => `File: ${r.relativePath}\n\`\`\`\n${r.snippet || ""}\n\`\`\``)
        .join("\n\n");
      const text = `Codebase Search Results for "${query}":\n\n${formatted}`;

      return {
        id: `codebase-search-${query}`,
        section: "search_results",
        title: `Codebase Search: "${query}"`,
        content: text,
        tokenCount: estimateTokens(text),
        priority: 75,
      };
    }

    // Bare @codebase: outline top-level structure and package.json info if present
    const entries: string[] = [];
    try {
      const dirents = await fs.promises.readdir(this.workspaceRoot, { withFileTypes: true });
      for (const d of dirents) {
        if (this.exclusions.isIgnoredDirectory(d.name)) continue;
        if (this.exclusions.isSensitive(d.name)) continue;
        entries.push(d.isDirectory() ? `${d.name}/` : d.name);
      }
    } catch {
      // ignore
    }

    let meta = "";
    const pkgPath = path.join(this.workspaceRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fs.promises.readFile(pkgPath, "utf8"));
        meta = `\nProject: ${pkg.name || "unnamed"} (v${pkg.version || "0.0.0"})\nDependencies: ${Object.keys(pkg.dependencies || {}).join(", ") || "none"}`;
      } catch {
        // ignore
      }
    }

    const content = `Codebase Root Outline:${meta}\n\nTop-level entries:\n${entries.map((e) => `- ${e}`).join("\n")}`;

    return {
      id: "codebase-outline",
      section: "outline",
      title: "Codebase Outline",
      content,
      tokenCount: estimateTokens(content),
      priority: 65,
    };
  }
}
