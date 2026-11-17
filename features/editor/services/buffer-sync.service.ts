import { normalizePath, readFileContent, writeFileContent, invokeCommand, isTauriEnvironment } from "@/lib/tauri-ipc";
import { ModelService } from "./model.service";
import { EditorService } from "./editor.service";
import { DiffService } from "@/lib/diff/diff-service";
import { FileDiff, ConflictDetails } from "@/lib/diff/types";
import { ideEvents } from "@/lib/events";

export interface CompareResult {
  isOpen: boolean;
  isDirty: boolean;
  bufferContent: string | null;
  diskContent: string;
  version: number | string | null;
  matches: boolean;
}

export interface PrepareChangeResult {
  allowed: boolean;
  diff: FileDiff;
  conflict: ConflictDetails | null;
  version: number | string | null;
  currentBuffer: string | null;
  currentDisk: string;
}

export interface ApplyChangeOptions {
  path: string;
  newContent: string;
  expectedVersion?: number | string | null;
  preserveUndo?: boolean;
  autoSave?: boolean;
}

export interface ApplyChangeResult {
  success: boolean;
  verified: boolean;
  version?: number | string | null;
  error?: string;
}

/**
 * Monaco Buffer Synchronization Service.
 * Implements the 10-step protocol to safely inspect, compare, propose,
 * approve, apply, and verify file edits without ever silently overwriting
 * dirty Monaco editor documents.
 */
export class BufferSyncService {
  /**
   * 1. Determines whether a file is currently open in a Monaco model.
   */
  static isDocumentOpen(filePath: string): boolean {
    return ModelService.hasModel(filePath);
  }

  /**
   * 2. Retrieves current in-memory content of an open Monaco model.
   */
  static getBufferContent(filePath: string): string | null {
    const model = ModelService.getModel(filePath);
    if (model && !model.isDisposed()) {
      return model.getValue();
    }
    return null;
  }

  /**
   * 3. Reads current content directly from the filesystem.
   */
  static async getDiskContent(filePath: string): Promise<string> {
    const norm = normalizePath(filePath);
    try {
      const res = await readFileContent(norm);
      return res.content || "";
    } catch {
      return "";
    }
  }

  /**
   * 4. Checks whether the file has unsaved in-memory changes compared to disk.
   */
  static async isDocumentDirty(filePath: string, diskContent?: string): Promise<boolean> {
    if (!this.isDocumentOpen(filePath)) return false;
    const buffer = this.getBufferContent(filePath);
    if (buffer === null) return false;

    const disk = diskContent !== undefined ? diskContent : await this.getDiskContent(filePath);
    return buffer !== disk;
  }

  /**
   * 5. Retrieves the document version ID (Monaco versionId or content hash).
   */
  static getDocumentVersion(filePath: string): number | string | null {
    const versionId = ModelService.getVersionId(filePath);
    if (versionId !== null) return versionId;

    const buffer = this.getBufferContent(filePath);
    if (buffer !== null) {
      return `hash_${buffer.length}_${Date.now()}`;
    }
    return null;
  }

  /**
   * 6. Compares in-memory buffer with disk content.
   */
  static async compareBufferWithDisk(filePath: string): Promise<CompareResult> {
    const norm = normalizePath(filePath);
    const isOpen = this.isDocumentOpen(norm);
    const diskContent = await this.getDiskContent(norm);
    const bufferContent = isOpen ? this.getBufferContent(norm) : null;
    const version = isOpen ? this.getDocumentVersion(norm) : null;

    const isDirty = isOpen && bufferContent !== null && bufferContent !== diskContent;
    const matches = isOpen ? bufferContent === diskContent : true;

    return {
      isOpen,
      isDirty,
      bufferContent,
      diskContent,
      version,
      matches,
    };
  }

  /**
   * Prepares a proposed change following steps 1 through 7 of the protocol.
   * Compares buffer, disk, base content, detects conflicts, and generates a structured diff.
   */
  static async prepareChange(params: {
    path: string;
    proposedContent: string;
    baseContent?: string | null;
  }): Promise<PrepareChangeResult> {
    const norm = normalizePath(params.path);
    const compare = await this.compareBufferWithDisk(norm);

    // Conflict detection
    const conflict = DiffService.detectConflict({
      path: norm,
      baseContent: params.baseContent,
      currentBuffer: compare.bufferContent,
      currentDisk: compare.diskContent,
      isDirty: compare.isDirty,
      fileExistsOnDisk: true,
      expectedToExist: true,
    });

    // Create structured diff
    // The diff is computed against the live buffer if open, or disk if not open
    const currentBase = compare.isOpen && compare.bufferContent !== null
      ? compare.bufferContent
      : compare.diskContent;

    const diff = DiffService.createFileDiff({
      path: norm,
      oldContent: currentBase,
      newContent: params.proposedContent,
      type: "modify",
    });

    if (conflict) {
      diff.status = "conflict";
      diff.conflict = conflict;
    }

    return {
      allowed: conflict === null,
      diff,
      conflict,
      version: compare.version,
      currentBuffer: compare.bufferContent,
      currentDisk: compare.diskContent,
    };
  }

  /**
   * Applies the change through the existing editor/document service,
   * synchronizes the model and disk, and verifies the resulting contents
   * (Steps 8 through 10 of the protocol).
   */
  static async applyChange(options: ApplyChangeOptions): Promise<ApplyChangeResult> {
    const norm = normalizePath(options.path);
    const preserveUndo = options.preserveUndo ?? true;
    const autoSave = options.autoSave ?? true;

    // Check version if provided
    if (options.expectedVersion !== undefined && options.expectedVersion !== null) {
      const currentVersion = this.getDocumentVersion(norm);
      if (currentVersion !== null && currentVersion !== options.expectedVersion) {
        return {
          success: false,
          verified: false,
          error: `Concurrent modification detected: expected version ${options.expectedVersion}, found ${currentVersion}`,
        };
      }
    }

    const wasOpen = this.isDocumentOpen(norm);
    const previousBuffer = wasOpen ? this.getBufferContent(norm) : null;

    try {
      // 8. Apply the change through existing editor/document service
      if (wasOpen) {
        const appliedToModel = ModelService.applyEdit(norm, options.newContent, preserveUndo);
        if (!appliedToModel) {
          throw new Error(`Failed to apply edit to active Monaco model for '${norm}'`);
        }
      }

      // 9. Synchronize the editor model and disk
      if (autoSave) {
        await EditorService.saveDocument(norm, options.newContent);
        ideEvents.emit("editor:document-saved", { path: norm });
        ideEvents.emit("editor:document-changed", { path: norm, isDirty: false });
        ideEvents.emit("file:content-changed", { path: norm, content: options.newContent });
      }

      // 10. Verify the resulting contents
      const verifyDisk = autoSave ? await this.getDiskContent(norm) : options.newContent;
      const verifyModel = wasOpen ? this.getBufferContent(norm) : options.newContent;

      const diskMatches = verifyDisk === options.newContent;
      const modelMatches = verifyModel === options.newContent;
      const verified = diskMatches && modelMatches;

      if (!verified) {
        throw new Error(
          `Verification failed: diskMatches=${diskMatches}, modelMatches=${modelMatches}`
        );
      }

      const finalVersion = this.getDocumentVersion(norm);

      return {
        success: true,
        verified: true,
        version: finalVersion,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Rollback model in case disk save failed
      if (wasOpen && previousBuffer !== null) {
        ModelService.applyEdit(norm, previousBuffer, false);
      }

      return {
        success: false,
        verified: false,
        error: msg,
      };
    }
  }

  /**
   * Safely creates a new file, ensuring it does not already exist.
   */
  static async createFile(
    filePath: string,
    initialContent = ""
  ): Promise<{ success: boolean; error?: string }> {
    const norm = normalizePath(filePath);

    // Check if already open
    if (this.isDocumentOpen(norm)) {
      return { success: false, error: `Document '${norm}' is already open in editor.` };
    }

    try {
      // Check if file exists on disk
      const existing = await readFileContent(norm).catch(() => null);
      if (existing) {
        return { success: false, error: `File '${norm}' already exists on disk.` };
      }

      await writeFileContent(norm, initialContent);
      ideEvents.emit("file:created", {
        path: norm,
        name: norm.split("/").pop() || "",
        isDirectory: false,
        size: initialContent.length,
        modifiedAt: Date.now(),
      });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Safely deletes a file, disposing any open Monaco models first.
   */
  static async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    const norm = normalizePath(filePath);

    try {
      // Dispose Monaco model if open
      if (this.isDocumentOpen(norm)) {
        ModelService.disposePath(norm);
        ideEvents.emit("editor:document-closed", { path: norm });
      }

      if (isTauriEnvironment()) {
        await invokeCommand("fs_delete_file", { path: norm });
      } else {
        await writeFileContent(norm, ""); // Fallback in web
      }

      ideEvents.emit("file:deleted", { path: norm, isDirectory: false });
      ideEvents.emit("files:deleted", { paths: [norm] });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Safely renames or moves a file, migrating Monaco models and view states.
   */
  static async renameFile(
    oldPath: string,
    newPath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco?: any
  ): Promise<{ success: boolean; error?: string }> {
    const normOld = normalizePath(oldPath);
    const normNew = normalizePath(newPath);

    try {
      // Migrate Monaco model if open
      if (this.isDocumentOpen(normOld)) {
        ModelService.renamePath(normOld, normNew, monaco);
      }

      if (isTauriEnvironment()) {
        await invokeCommand("fs_rename_file", { oldPath: normOld, newPath: normNew });
      }

      ideEvents.emit("file:renamed", {
        oldPath: normOld,
        newPath: normNew,
        isDirectory: false,
      });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Reverts an open dirty Monaco model to disk content.
   */
  static async revertBufferToDisk(filePath: string): Promise<boolean> {
    const norm = normalizePath(filePath);
    if (!this.isDocumentOpen(norm)) return false;

    const disk = await this.getDiskContent(norm);
    const applied = ModelService.applyEdit(norm, disk, true);
    if (applied) {
      ideEvents.emit("editor:document-changed", { path: norm, isDirty: false });
    }
    return applied;
  }
}
