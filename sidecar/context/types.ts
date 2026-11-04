/**
 * Domain types for Kairo AI Agent Workspace Intelligence and Context Subsystem.
 */
import type {
  WorkspaceContextPayload,
  ActiveDocumentContext,
  OpenDocumentContext,
  DiagnosticItem,
} from "../../lib/ai-agent/types";

export type ContextSection =
  | "instructions"
  | "active_editor"
  | "diagnostics"
  | "mentions"
  | "search_results"
  | "outline";

export interface ContextItem {
  id: string;
  section: ContextSection;
  title: string;
  filePath?: string;
  content: string;
  tokenCount: number;
  priority: number; // Higher number = higher priority retention
  metadata?: Record<string, unknown>;
}

export type MentionType =
  | "@file"
  | "@folder"
  | "@codebase"
  | "@selection"
  | "@terminal"
  | "@problems";

export interface ParsedMention {
  type: MentionType;
  query?: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface CodebaseSearchMatch {
  lineNumber: number;
  lineContent: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export interface CodebaseSearchResult {
  filePath: string;
  relativePath: string;
  score: number;
  matches: CodebaseSearchMatch[];
  symbolName?: string;
  snippet?: string;
}

export interface ContextBudgetConfig {
  maxTotalTokens: number;
  sectionBudgets?: Partial<Record<ContextSection, number>>;
}

export interface AssembledContext {
  formattedPrompt: string;
  totalEstimatedTokens: number;
  includedFiles: string[];
  items: ContextItem[];
  truncated: boolean;
}

export interface ResolveContextOptions {
  workspaceRoot: string;
  prompt: string;
  context?: WorkspaceContextPayload;
  budget?: Partial<ContextBudgetConfig>;
  searchQuery?: string;
}
