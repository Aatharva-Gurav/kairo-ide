/**
 * Context Service for Kairo AI Agent Workspace Intelligence.
 *
 * Orchestrates:
 * - Project instruction discovery (.kairo/instructions.md, .clinerules, AGENTS.md)
 * - Live active editor state & dirty unsaved buffers
 * - Monaco diagnostics and problems
 * - Mention parsing and resolution (@file, @folder, @codebase, @selection, @terminal, @problems)
 * - Codebase search and ranking
 * - Budget management, deduplication, and markdown assembly
 */
import fs from "node:fs";
import path from "node:path";
import { ExclusionsManager } from "./exclusions";
import { CodebaseSearchEngine, ContentSearchOptions } from "./file-search";
import { MentionsResolver, estimateTokens } from "./mentions-resolver";
import { ContextBudgetManager } from "./budget-manager";
import type {
  ContextItem,
  AssembledContext,
  ResolveContextOptions,
  CodebaseSearchResult,
  ContextBudgetConfig,
} from "./types";

export class ContextService {
  private readonly workspaceRoot: string;
  private readonly exclusions: ExclusionsManager;
  private readonly searchEngine: CodebaseSearchEngine;
  private readonly mentionsResolver: MentionsResolver;
  private readonly budgetManager: ContextBudgetManager;

  constructor(workspaceRoot: string, budgetConfig?: Partial<ContextBudgetConfig>) {
    this.workspaceRoot = path.normalize(workspaceRoot);
    this.exclusions = new ExclusionsManager(this.workspaceRoot);
    this.searchEngine = new CodebaseSearchEngine(this.workspaceRoot, this.exclusions);
    this.mentionsResolver = new MentionsResolver(this.workspaceRoot, this.exclusions);
    this.budgetManager = new ContextBudgetManager(budgetConfig);
  }

  /**
   * Primary entrypoint: Resolves, assembles, and formats all relevant workspace context
   * for a given agent task or message prompt.
   */
  public async resolveContext(options: ResolveContextOptions): Promise<AssembledContext> {
    const rawItems: ContextItem[] = [];

    // 1. Project instructions (.kairo/instructions.md, .clinerules, AGENTS.md, etc.)
    const instructionItem = await this.loadProjectInstructions();
    if (instructionItem) {
      rawItems.push(instructionItem);
    }

    // 2. Active editor document (dirty buffer takes precedence over disk)
    if (options.context?.activeDocument && options.context.activeDocument.content) {
      const activeDoc = options.context.activeDocument;
      const relPath = path.isAbsolute(activeDoc.path)
        ? path.relative(this.workspaceRoot, activeDoc.path).replace(/\\/g, "/")
        : activeDoc.path.replace(/\\/g, "/");

      // Check if sensitive
      if (!this.exclusions.isSensitive(relPath)) {
        const dirtyMarker = activeDoc.isDirty ? " (Unsaved In-Memory Editor Buffer)" : "";
        const cursorInfo = activeDoc.cursorPosition
          ? `\n// Cursor position: Line ${activeDoc.cursorPosition.line}, Column ${activeDoc.cursorPosition.column}`
          : "";
        const content = `\`\`\`${activeDoc.language || ""}${cursorInfo}\n${activeDoc.content}\n\`\`\``;

        rawItems.push({
          id: `active-doc-${relPath}`,
          section: "active_editor",
          title: `Active Editor: ${relPath}${dirtyMarker}`,
          filePath: relPath,
          content,
          tokenCount: estimateTokens(content),
          priority: 95,
        });
      }
    }

    // 3. Open tabs summary
    if (options.context?.openDocuments && options.context.openDocuments.length > 0) {
      const openTabs = options.context.openDocuments.map((doc) => {
        const rel = path.isAbsolute(doc.path)
          ? path.relative(this.workspaceRoot, doc.path).replace(/\\/g, "/")
          : doc.path.replace(/\\/g, "/");
        return `- ${rel} (${doc.language}${doc.isDirty ? ", unsaved" : ""})`;
      });

      const tabsContent = `Currently Open Tabs:\n${openTabs.join("\n")}`;
      rawItems.push({
        id: "open-tabs-summary",
        section: "active_editor",
        title: "Open Tabs",
        content: tabsContent,
        tokenCount: estimateTokens(tabsContent),
        priority: 50,
      });
    }

    // 4. Monaco diagnostics / problems
    if (options.context?.diagnostics && options.context.diagnostics.length > 0) {
      const errorsAndWarnings = options.context.diagnostics.filter(
        (d) => d.severity === "error" || d.severity === "warning"
      );
      if (errorsAndWarnings.length > 0) {
        const diagList = errorsAndWarnings.slice(0, 15).map((d) => {
          const rel = path.isAbsolute(d.filePath)
            ? path.relative(this.workspaceRoot, d.filePath).replace(/\\/g, "/")
            : d.filePath.replace(/\\/g, "/");
          return `- [${d.severity.toUpperCase()}] ${rel}:${d.line}:${d.column} - ${d.message}`;
        });

        const content = `Workspace Diagnostics:\n${diagList.join("\n")}`;
        rawItems.push({
          id: "workspace-diagnostics",
          section: "diagnostics",
          title: "Diagnostics & Lint Errors",
          content,
          tokenCount: estimateTokens(content),
          priority: 88,
        });
      }
    }

    // 5. Explicit mentions in prompt (@file, @folder, @codebase, @selection, @terminal, @problems)
    const mentions = this.mentionsResolver.parseMentions(options.prompt);
    if (mentions.length > 0) {
      const mentionItems = await this.mentionsResolver.resolveMentions(mentions, {
        context: options.context,
        searchEngine: this.searchEngine,
      });
      rawItems.push(...mentionItems);
    }

    // 6. Explicit search query (if supplied)
    if (options.searchQuery && options.searchQuery.trim()) {
      const searchResults = await this.searchEngine.searchContent(options.searchQuery, {
        limit: 8,
      });
      if (searchResults.length > 0) {
        const ranked = this.searchEngine.rankResults(
          searchResults,
          options.context?.activeDocument?.path,
          options.context?.openDocuments?.map((d) => d.path)
        );

        const formatted = ranked
          .map((r) => `File: ${r.relativePath}\n\`\`\`\n${r.snippet || ""}\n\`\`\``)
          .join("\n\n");
        const content = `Search Results for "${options.searchQuery}":\n\n${formatted}`;

        rawItems.push({
          id: `explicit-search-${options.searchQuery}`,
          section: "search_results",
          title: `Search: "${options.searchQuery}"`,
          content,
          tokenCount: estimateTokens(content),
          priority: 80,
        });
      }
    }

    // 7. Enforce context budget, deduplicate, and assemble into markdown
    return this.budgetManager.assembleContext(rawItems);
  }

  /**
   * Search files in codebase by name.
   */
  public async searchFiles(pattern: string, limit = 20): Promise<CodebaseSearchResult[]> {
    return this.searchEngine.searchFileName(pattern, limit);
  }

  /**
   * Search content in codebase.
   */
  public async searchContent(
    query: string,
    options?: ContentSearchOptions
  ): Promise<CodebaseSearchResult[]> {
    return this.searchEngine.searchContent(query, options);
  }

  /**
   * Search language symbols.
   */
  public async searchSymbols(query: string, limit = 20): Promise<CodebaseSearchResult[]> {
    return this.searchEngine.searchSymbols(query, limit);
  }

  /**
   * Checks for and reads project-level instruction files.
   */
  private async loadProjectInstructions(): Promise<ContextItem | null> {
    const candidates = [
      path.join(this.workspaceRoot, ".kairo", "instructions.md"),
      path.join(this.workspaceRoot, ".clinerules"),
      path.join(this.workspaceRoot, "AGENTS.md"),
      path.join(this.workspaceRoot, "CLINE.md"),
    ];

    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) {
          const content = await fs.promises.readFile(file, "utf8");
          const rel = path.relative(this.workspaceRoot, file).replace(/\\/g, "/");
          return {
            id: `project-instructions-${rel}`,
            section: "instructions",
            title: `Project Instructions (${rel})`,
            filePath: rel,
            content,
            tokenCount: estimateTokens(content),
            priority: 100, // Highest priority
          };
        }
      } catch {
        // Ignore read errors
      }
    }

    return null;
  }
}
