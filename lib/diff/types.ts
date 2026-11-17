/**
 * Structured Diff & Conflict Types for Kairo IDE.
 * Supports additions, modifications, deletions, renames, multi-file diffs,
 * conflict reporting, and partial failure detection.
 */

export type DiffChangeType = "add" | "modify" | "delete" | "rename";

export type DiffStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "conflict"
  | "failed";

export type MultiDiffStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "partial_failure"
  | "conflict";

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export type ConflictType =
  | "dirty_buffer"
  | "disk_mismatch"
  | "version_mismatch"
  | "deleted_target"
  | "already_exists";

export interface ConflictDetails {
  type: ConflictType;
  message: string;
  path: string;
  baseContent?: string | null;
  currentContent?: string | null;
  proposedContent?: string | null;
  timestamp?: number;
}

export interface FileDiff {
  id: string;
  type: DiffChangeType;
  path: string;
  oldPath?: string;
  oldContent: string | null;
  newContent: string | null;
  hunks: DiffHunk[];
  status: DiffStatus;
  conflict?: ConflictDetails;
  error?: string;
}

export interface MultiFileDiff {
  id: string;
  title?: string;
  description?: string;
  files: FileDiff[];
  status: MultiDiffStatus;
  createdAt: number;
}
