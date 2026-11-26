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
      (baseContent === undefined || baseContent === null || currentBuffer !== baseContent)
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

    // Check 4: Disk content changed externally (including line-ending mismatches)
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
   * Computes unified diff hunks using prefix/suffix trimming and bounded LCS diffing.
   */
  static computeHunks(oldStr: string, newStr: string): DiffHunk[] {
    if (oldStr === newStr) return [];

    const oldLines = oldStr === "" ? [] : oldStr.split(/\r?\n/);
    const newLines = newStr === "" ? [] : newStr.split(/\r?\n/);

    const m = oldLines.length;
    const n = newLines.length;

    // 1. O(m + n) common prefix & suffix trimming to avoid large-file matrix blowups
    let prefixLen = 0;
    while (prefixLen < m && prefixLen < n && oldLines[prefixLen] === newLines[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    while (
      suffixLen < m - prefixLen &&
      suffixLen < n - prefixLen &&
      oldLines[m - 1 - suffixLen] === newLines[n - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const midOld = oldLines.slice(prefixLen, m - suffixLen);
    const midNew = newLines.slice(prefixLen, n - suffixLen);
    const midM = midOld.length;
    const midN = midNew.length;

    if (midM === 0 && midN === 0) {
      return [];
    }

    const MAX_DP_CELLS = 4_000_000;
    if (midM * midN > MAX_DP_CELLS) {
      // Bounded linear fallback for massive multi-thousand-line rewrites
      const lines: string[] = [];
      for (const line of midOld) lines.push(`-${line}`);
      for (const line of midNew) lines.push(`+${line}`);
      return [
        {
          oldStart: prefixLen + 1,
          oldLines: midM,
          newStart: prefixLen + 1,
          newLines: midN,
          lines,
        },
      ];
    }

    // 2. LCS matrix over trimmed change window
    const dp: number[][] = Array.from({ length: midM + 1 }, () => new Array(midN + 1).fill(0));

    for (let i = 0; i < midM; i++) {
      for (let j = 0; j < midN; j++) {
        if (midOld[i] === midNew[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Backtrack to produce line changes
    type LineOp = { type: " " | "-" | "+"; line: string };
    const ops: LineOp[] = [];
    let i = midM;
    let j = midN;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        ops.push({ type: " ", line: midOld[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: "+", line: midNew[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        ops.push({ type: "-", line: midOld[i - 1] });
        i--;
      }
    }

    ops.reverse();

    // Group changes into hunks separated by more than 6 unchanged lines (3 trailing + 3 leading context)
    const CONTEXT_LINES = 3;
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = prefixLen + 1;
    let newLineNum = prefixLen + 1;
    let unchangedRun = 0;
    const leadingContext: string[] = [];

    for (let idx = 0; idx < ops.length; idx++) {
      const op = ops[idx];
      if (op.type === " ") {
        if (currentHunk) {
          // Peek ahead: close hunk if next change is beyond 2 * CONTEXT_LINES
          let lookahead = idx;
          while (lookahead < ops.length && ops[lookahead].type === " ") {
            lookahead++;
          }
          const gapLen = lookahead - idx;
          if (lookahead === ops.length || gapLen > CONTEXT_LINES * 2) {
            if (unchangedRun < CONTEXT_LINES) {
              currentHunk.lines.push(` ${op.line}`);
              currentHunk.oldLines++;
              currentHunk.newLines++;
              unchangedRun++;
            }
            if (unchangedRun >= CONTEXT_LINES || lookahead === ops.length) {
              currentHunk = null;
              unchangedRun = 0;
            }
          } else {
            currentHunk.lines.push(` ${op.line}`);
            currentHunk.oldLines++;
            currentHunk.newLines++;
            unchangedRun++;
          }
        } else {
          leadingContext.push(op.line);
          if (leadingContext.length > CONTEXT_LINES) {
            leadingContext.shift();
          }
        }
        oldLineNum++;
        newLineNum++;
      } else {
        unchangedRun = 0;
        if (!currentHunk) {
          const ctxCount = leadingContext.length;
          currentHunk = {
            oldStart: oldLineNum - ctxCount,
            oldLines: ctxCount,
            newStart: newLineNum - ctxCount,
            newLines: ctxCount,
            lines: leadingContext.map((l) => ` ${l}`),
          };
          leadingContext.length = 0;
          hunks.push(currentHunk);
        }
        if (op.type === "-") {
          currentHunk.lines.push(`-${op.line}`);
          currentHunk.oldLines++;
          oldLineNum++;
        } else {
          currentHunk.lines.push(`+${op.line}`);
          currentHunk.newLines++;
          newLineNum++;
        }
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
   * Safely applies hunks to original content while preserving original line endings.
   */
  static applyHunks(originalContent: string, hunks: DiffHunk[]): string {
    if (hunks.length === 0) return originalContent;

    const eol = originalContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = originalContent === "" ? [] : originalContent.split(/\r?\n/);
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

    return lines.join(eol);
  }
}
