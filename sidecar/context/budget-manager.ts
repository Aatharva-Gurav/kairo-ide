/**
 * Context Budget Manager for Kairo Workspace Intelligence.
 *
 * Enforces strict token limits across context sections, performs smart
 * line-preserving truncation, deduplicates files across sections,
 * and formats assembled context into structured Markdown.
 */
import type {
  ContextItem,
  ContextSection,
  ContextBudgetConfig,
  AssembledContext,
} from "./types";
import { estimateTokens } from "./mentions-resolver";

export const DEFAULT_MAX_TOTAL_TOKENS = 16000;

export const DEFAULT_SECTION_BUDGETS: Record<ContextSection, number> = {
  instructions: 2000,
  active_editor: 4500,
  diagnostics: 2000,
  mentions: 5000,
  search_results: 3000,
  outline: 1000,
};

// Section priority order (higher = retained first when budget is constrained)
const SECTION_ORDER: ContextSection[] = [
  "instructions",
  "active_editor",
  "diagnostics",
  "mentions",
  "search_results",
  "outline",
];

export class ContextBudgetManager {
  private readonly config: ContextBudgetConfig;

  constructor(config?: Partial<ContextBudgetConfig>) {
    this.config = {
      maxTotalTokens: config?.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS,
      sectionBudgets: {
        ...DEFAULT_SECTION_BUDGETS,
        ...(config?.sectionBudgets || {}),
      },
    };
  }

  /**
   * Deduplicates, budget-allocates, smart-truncates, and formats context items into
   * a single cohesive AssembledContext output.
   */
  public assembleContext(items: ContextItem[]): AssembledContext {
    const deduplicated = this.deduplicateItems(items);

    // Group items by section
    const bySection = new Map<ContextSection, ContextItem[]>();
    for (const sec of SECTION_ORDER) {
      bySection.set(sec, []);
    }
    for (const item of deduplicated) {
      const list = bySection.get(item.section) || [];
      list.push(item);
      bySection.set(item.section, list);
    }

    const includedItems: ContextItem[] = [];
    const includedFiles = new Set<string>();
    let totalTokens = 0;
    let wasTruncated = false;

    // Process each section according to priority
    for (const section of SECTION_ORDER) {
      const sectionItems = bySection.get(section) || [];
      // Sort items in this section by priority descending
      sectionItems.sort((a, b) => b.priority - a.priority);

      const sectionBudget =
        this.config.sectionBudgets?.[section] ?? DEFAULT_SECTION_BUDGETS[section];
      let sectionTokens = 0;

      for (const item of sectionItems) {
        if (totalTokens >= this.config.maxTotalTokens) {
          wasTruncated = true;
          break;
        }

        const remainingTotal = this.config.maxTotalTokens - totalTokens;
        const remainingSection = sectionBudget - sectionTokens;
        const availableBudget = Math.min(remainingTotal, remainingSection);

        if (availableBudget <= 30) {
          // Insufficient budget for this item in this section
          wasTruncated = true;
          continue;
        }

        if (item.tokenCount <= availableBudget) {
          // Fits fully
          includedItems.push(item);
          totalTokens += item.tokenCount;
          sectionTokens += item.tokenCount;
          if (item.filePath) {
            includedFiles.add(item.filePath);
          }
        } else {
          // Truncate to available budget
          const truncatedItem = this.truncateItem(item, availableBudget);
          includedItems.push(truncatedItem);
          totalTokens += truncatedItem.tokenCount;
          sectionTokens += truncatedItem.tokenCount;
          if (truncatedItem.filePath) {
            includedFiles.add(truncatedItem.filePath);
          }
          wasTruncated = true;
        }
      }
    }

    // Format final markdown string
    const formattedPrompt = this.formatMarkdown(includedItems);

    return {
      formattedPrompt,
      totalEstimatedTokens: totalTokens,
      includedFiles: Array.from(includedFiles),
      items: includedItems,
      truncated: wasTruncated,
    };
  }

  /**
   * Deduplicates context items by filePath or id.
   * If an item with the same file or id appears multiple times, keeps the one with higher priority.
   */
  private deduplicateItems(items: ContextItem[]): ContextItem[] {
    const fileMap = new Map<string, ContextItem>();
    const otherItems: ContextItem[] = [];

    for (const item of items) {
      if (item.filePath) {
        const key = item.filePath.toLowerCase().replace(/\\/g, "/");
        const existing = fileMap.get(key);
        if (!existing || item.priority > existing.priority) {
          fileMap.set(key, item);
        }
      } else {
        const existing = otherItems.find((o) => o.id === item.id);
        if (!existing) {
          otherItems.push(item);
        } else if (item.priority > existing.priority) {
          const idx = otherItems.indexOf(existing);
          otherItems[idx] = item;
        }
      }
    }

    return [...fileMap.values(), ...otherItems];
  }

  /**
   * Smart line-preserving truncation for items exceeding allocated token budget.
   */
  private truncateItem(item: ContextItem, allowedTokens: number): ContextItem {
    const lines = item.content.split(/\r?\n/);
    if (lines.length <= 10) {
      // Just slice characters if very few lines
      const maxChars = allowedTokens * 4;
      const sliced = item.content.slice(0, Math.max(0, maxChars - 40)) + "\n... [truncated]";
      return {
        ...item,
        content: sliced,
        tokenCount: estimateTokens(sliced),
      };
    }

    // Preserve the first 60% and last 40% of allowed lines
    const allowedChars = allowedTokens * 4;
    const avgCharsPerLine = Math.max(20, Math.floor(item.content.length / lines.length));
    const targetLines = Math.max(4, Math.floor(allowedChars / avgCharsPerLine));

    const headCount = Math.floor(targetLines * 0.6);
    const tailCount = Math.max(1, targetLines - headCount);

    const headLines = lines.slice(0, headCount);
    const tailLines = lines.slice(-tailCount);
    const omittedCount = Math.max(0, lines.length - headCount - tailCount);

    const omissionNotice = `\n// ... [${omittedCount} lines omitted due to context budget] ...\n`;
    const newContent = `${headLines.join("\n")}${omissionNotice}${tailLines.join("\n")}`;

    return {
      ...item,
      content: newContent,
      tokenCount: estimateTokens(newContent),
    };
  }

  /**
   * Formats the included items into standard markdown context blocks.
   */
  private formatMarkdown(items: ContextItem[]): string {
    if (items.length === 0) return "";

    const sections: string[] = ["# Workspace Context"];

    for (const item of items) {
      sections.push(`## ${item.title}\n\n${item.content}`);
    }

    return sections.join("\n\n");
  }
}
