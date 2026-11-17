import {
  DiffChangeType,
  DiffHunk,
  FileDiff,
  MultiFileDiff,
  ConflictDetails,
  MultiDiffStatus,
} from "./types";

/**
 * Robust Diff and Conflict Service for Kairo IDE.
 * Computes line-level diffs, unified hunks, detects conflicts, and formats diffs.
 */
export class DiffService {
  /**
   * Generates a unique ID for diff entities.
   */
  static generateId(prefix = "diff"): string {
    return `${prefix}_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`;
  }

  /**
   * Computes a structured FileDiff between oldContent and newContent.
   */
  static createFileDiff(params: {
    path: string;
    oldContent: string | null;
    newContent: string | null;
    type?: DiffChangeType;
    oldPath?: string;
    id?: string;
  }): FileDiff {
    const { path, oldContent, newContent, oldPath } = params;
    const id = params.id || this.generateId("file_diff");

    let type: DiffChangeType = params.type || "modify";
    if (oldContent === null && newContent !== null) {
      type = "add";
    } else if (oldContent !== null && newContent === null) {
      type = "delete";
    } else if (oldPath && oldPath !== path) {
      type = "rename";
    }

    const hunks = this.computeHunks(oldContent ?? "", newContent ?? "");

    return {
      id,
      type,
      path,
      oldPath,
      oldContent,
      newContent,
      hunks,
      status: "pending",
    };
  }

  /**
   * Assembles multiple FileDiff instances into an atomic MultiFileDiff.
   */
  static createMultiFileDiff(params: {
    files: FileDiff[];
    title?: string;
    description?: string;
    id?: string;
  }): MultiFileDiff {
    const id = params.id || this.generateId("multi_diff");
    const status = this.aggregateStatus(params.files);

    return {
      id,
      title: params.title,
      description: params.description,
      files: params.files,
      status,
      createdAt: Date.now(),
    };
  }

  /**
   * Calculates overall status across multiple file diffs.
   */
  static aggregateStatus(files: FileDiff[]): MultiDiffStatus {
    if (files.length === 0) return "pending";

    const hasConflict = files.some((f) => f.status === "conflict");
    if (hasConflict) return "conflict";

    const hasFailed = files.some((f) => f.status === "failed");
    const hasApplied = files.some((f) => f.status === "applied");
    if (hasFailed && hasApplied) return "partial_failure";
    if (hasFailed) return "partial_failure";

    const hasRejected = files.some((f) => f.status === "rejected");
    if (hasRejected) return "rejected";

    const allApplied = files.every((f) => f.status === "applied");
    if (allApplied) return "applied";

    return "pending";
  }

  /**
   * Detects conflicts between base content, active buffer, and disk content.
   */
  static detectConflict(params: {
    path: string;
    baseContent?: string | null;
    currentBuffer?: string | null;
    currentDisk?: string | null;
    isDirty?: boolean;
    fileExistsOnDisk?: boolean;
    expectedToExist?: boolean;
  }): ConflictDetails | null {
    const {
      path,
      baseContent,
      currentBuffer,
      currentDisk,
      isDirty,
      fileExistsOnDisk,
      expectedToExist,
    } = params;

    // Check 1: Target deleted on disk when expected to exist
    if (expectedToExist === true && fileExistsOnDisk === false) {
      return {
        type: "deleted_target",
        message: `File '${path}' was deleted from disk externally.`,
        path,
        baseContent,
        timestamp: Date.now(),
      };
    }

    // Check 2: Target already exists when creating new file
    if (expectedToExist === false && fileExistsOnDisk === true) {
      return {
        type: "already_exists",
        message: `File '${path}' already exists on disk.`,
        path,
        timestamp: Date.now(),
      };
    }

    // Check 3: Active in-memory buffer has unsaved edits
    if (
      isDirty &&
      currentBuffer !== undefined &&
      currentBuffer !== null &&
      baseContent !== undefined &&
      baseContent !== null &&
      currentBuffer !== baseContent
    ) {
      return {
        type: "dirty_buffer",
        message: `File '${path}' has unsaved modifications in the active editor buffer.`,
        path,
        baseContent,
        currentContent: currentBuffer,
        timestamp: Date.now(),
      };
    }

    // Check 4: Disk content changed externally
    if (
      currentDisk !== undefined &&
      currentDisk !== null &&
      baseContent !== undefined &&
      baseContent !== null &&
      currentDisk !== baseContent
    ) {
      return {
        type: "disk_mismatch",
        message: `File '${path}' was modified on disk outside the current session.`,
        path,
        baseContent,
        currentContent: currentDisk,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Computes unified diff hunks using an LCS line-based diff algorithm.
   */
  static computeHunks(oldStr: string, newStr: string): DiffHunk[] {
    if (oldStr === newStr) return [];

    const oldLines = oldStr ? oldStr.split(/\r?\n/) : [];
    const newLines = newStr ? newStr.split(/\r?\n/) : [];

    // Longest Common Subsequence matrix
    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (oldLines[i] === newLines[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Backtrack to produce line changes
    type LineOp = { type: " " | "-" | "+"; line: string; oldIdx?: number; newIdx?: number };
    const ops: LineOp[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        ops.push({ type: " ", line: oldLines[i - 1], oldIdx: i - 1, newIdx: j - 1 });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: "+", line: newLines[j - 1], newIdx: j - 1 });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        ops.push({ type: "-", line: oldLines[i - 1], oldIdx: i - 1 });
        i--;
      }
    }

    ops.reverse();

    // Group changes into hunks with context
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const op of ops) {
      if (op.type === " ") {
        if (currentHunk) {
          // If we have an active hunk, add context line
          currentHunk.lines.push(` ${op.line}`);
          currentHunk.oldLines++;
          currentHunk.newLines++;
          // Close hunk if it trailing context is sufficient or next change is far
          // (For simplicity in our structured representation, keep tight contiguous hunks)
        }
        oldLineNum++;
        newLineNum++;
      } else if (op.type === "-") {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: 0,
            newStart: newLineNum,
            newLines: 0,
            lines: [],
          };
          hunks.push(currentHunk);
        }
        currentHunk.lines.push(`-${op.line}`);
        currentHunk.oldLines++;
        oldLineNum++;
      } else if (op.type === "+") {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: 0,
            newStart: newLineNum,
            newLines: 0,
            lines: [],
          };
          hunks.push(currentHunk);
        }
        currentHunk.lines.push(`+${op.line}`);
        currentHunk.newLines++;
        newLineNum++;
      }
    }

    return hunks;
  }

  /**
   * Formats a FileDiff into standard unified diff string.
   */
  static formatUnifiedDiff(fileDiff: FileDiff): string {
    const oldHeader = fileDiff.oldPath ? fileDiff.oldPath : fileDiff.path;
    const newHeader = fileDiff.path;

    const lines: string[] = [
      `--- a/${oldHeader}`,
      `+++ b/${newHeader}`,
    ];

    if (fileDiff.hunks.length === 0) {
      return lines.join("\n");
    }

    for (const hunk of fileDiff.hunks) {
      lines.push(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
      );
      lines.push(...hunk.lines);
    }

    return lines.join("\n");
  }

  /**
   * Safely applies hunks to original content.
   */
  static applyHunks(originalContent: string, hunks: DiffHunk[]): string {
    if (hunks.length === 0) return originalContent;

    const lines = originalContent.split(/\r?\n/);
    // Work from bottom to top to preserve line index stability
    const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

    for (const hunk of sortedHunks) {
      const startIndex = Math.max(0, hunk.oldStart - 1);
      const replacementLines: string[] = [];

      for (const hLine of hunk.lines) {
        if (hLine.startsWith("+")) {
          replacementLines.push(hLine.slice(1));
        } else if (hLine.startsWith(" ")) {
          replacementLines.push(hLine.slice(1));
        }
        // '-' lines are dropped
      }

      lines.splice(startIndex, hunk.oldLines, ...replacementLines);
    }

    return lines.join("\n");
  }
}
