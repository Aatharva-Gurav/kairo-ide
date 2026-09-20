/**
 * Domain types for Editor subsystem, Monaco integration, formatting, and navigation.
 */

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

export interface EditorDocument {
  id: string; // Normalized file path
  path: string; // Normalized file path
  title: string; // File name with extension
  language: string; // Monaco language ID
  content: string; // Active (in-memory) content
  savedContent: string; // Last persisted content on disk
  isDirty: boolean; // True when content !== savedContent
  isBinary?: boolean;
  isTooLarge?: boolean;
  readonly?: boolean;
  cursorPosition?: CursorPosition;
  scrollPosition?: ScrollPosition;
  viewState?: unknown; // Preserved Monaco view state
  error?: string | null;
}

export type { EditorSettings, FilesSettings } from "@/features/settings/types";
import { DEFAULT_SETTINGS } from "@/features/settings/registry";
export { DEFAULT_SETTINGS };
export const DEFAULT_EDITOR_SETTINGS = DEFAULT_SETTINGS.editor;

export type SplitDirection = "horizontal" | "vertical";

export interface EditorSplitState {
  isSplit: boolean;
  splitDocumentId: string | null;
  splitRatio: number;
}

export interface FormatOptions {
  tabSize?: number;
  insertSpaces?: boolean;
}

export interface FormatterProvider {
  id: string;
  name: string;
  canFormat(language: string): boolean;
  format(content: string, options?: FormatOptions): Promise<string>;
}

export interface QuickOpenFileItem {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
}

export type DirtyCloseConfirmAction = "save" | "discard" | "cancel";

