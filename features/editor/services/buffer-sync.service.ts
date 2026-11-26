import {
  normalizePath,
  readFileContent,
  writeFileContent,
  invokeCommand,
  isDescendant,
} from "@/lib/tauri-ipc";
import { ModelService } from "./model.service";
import { EditorService } from "./editor.service";
import { DiffService } from "@/lib/diff/diff-service";
import { FileDiff, ConflictDetails } from "@/lib/diff/types";
import { ideEvents } from "@/lib/events";

export interface EditorDocumentSnapshot {
  id: string;
  path: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  isBinary?: boolean;
  readonly?: boolean;
}

export interface EditorSyncBridge {
  getDocuments: () => EditorDocumentSnapshot[];
  applySyncToDocument: (
    path: string,
    newContent: string,
    options: { saved: boolean }
  ) => void;
  reportConflict?: (conflict: ConflictDetails) => void;
  clearConflict?: (path: string) => void;
}

export interface CompareResult {
  isOpen: boolean;
  isDirty: boolean;
  bufferContent: string | null;
  diskContent: string;
  fileExistsOnDisk: boolean;
  version: number | string | null;
  matches: boolean;
  error?: string;
}

export interface PrepareChangeResult {
  allowed: boolean;
  diff: FileDiff;
  conflict: ConflictDetails | null;
  version: number | string | null;
  currentBuffer: string | null;
  currentDisk: string;
  error?: string;
}

export interface ApplyChangeOptions {
  path: string;
  newContent: string;
  expectedVersion?: number | string | null;
  preserveUndo?: boolean;
  autoSave?: boolean;
  preserveLineEndings?: boolean;
}

export interface ApplyChangeResult {
  success: boolean;
  verified: boolean;
  version?: number | string | null;
  error?: string;
}

interface DiskReadState {
  exists: boolean;
  content: string;
  isBinary: boolean;
  readonly: boolean;
  accessError?: string;
}

function isNotFoundErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("not found") ||
    lower.includes("could not be found") ||
    lower.includes("enoent")
  );
}

function hasPathTraversalOrUnsafeChars(rawPath: string, normalizedPath: string): boolean {
  if (!rawPath || !rawPath.trim() || !normalizedPath) return true;
  if (/[\0\x00-\x1f]/.test(rawPath)) return true;
  if (rawPath.startsWith("\\\\") || rawPath.startsWith("//")) return true;
  const rawSegs = rawPath.split(/[\\/]/);
  return rawSegs.some((seg) => seg === "..");
}

function matchLineEndingStyle(reference: string, candidate: string): string {
  if (!reference || !candidate) return candidate;
  const refHasCrlf = reference.includes("\r\n");
  const refHasLfOnly = !refHasCrlf && reference.includes("\n");

  if (refHasCrlf) {
    return candidate.replace(/\r?\n/g, "\r\n");
  }
  if (refHasLfOnly && candidate.includes("\r\n")) {
    return candidate.replace(/\r\n/g, "\n");
  }
  return candidate;
}

/**
 * Monaco Buffer Synchronization Service.
 * Implements the 10-step protocol to safely inspect, compare, propose,
 * approve, apply, and verify file edits without ever silently overwriting
 * dirty editor buffers or stale workspace state.
 */
export class BufferSyncService {
  private static editorBridge: EditorSyncBridge | null = null;
  private static activeWorkspaceRoot: string | null = null;
  private static workspaceGeneration = 0;
  private static lifecycleSubscribed = false;
  private static conflicts = new Map<string, ConflictDetails>();

  private static ensureLifecycleSubscribed(): void {
    if (this.lifecycleSubscribed) return;
    this.lifecycleSubscribed = true;

    ideEvents.on("workspace:opened", (payload) => {
      this.setWorkspaceScope(payload?.rootPath ?? null);
    });
    ideEvents.on("workspace:switched", (payload) => {
      this.setWorkspaceScope(payload?.to?.rootPath ?? null);
    });
    ideEvents.on("workspace:closed", () => {
      this.setWorkspaceScope(null);
    });
  }

  /**
   * Registers the live EditorProvider state bridge (called from useEffect, never during render).
   */
  static connectEditorBridge(bridge: EditorSyncBridge): () => void {
    this.ensureLifecycleSubscribed();
    this.editorBridge = bridge;
    return () => {
      if (this.editorBridge === bridge) {
        this.editorBridge = null;
      }
    };
  }

  /**
   * Updates the active workspace boundary and bumps generation so any in-flight
   * async operations from an older workspace are rejected cleanly.
   */
  static setWorkspaceScope(rootPath: string | null): number {
    this.ensureLifecycleSubscribed();
    this.activeWorkspaceRoot = rootPath ? normalizePath(rootPath) : null;
    this.workspaceGeneration += 1;
    this.conflicts.clear();
    return this.workspaceGeneration;
  }

  static getWorkspaceGeneration(): number {
    this.ensureLifecycleSubscribed();
    return this.workspaceGeneration;
  }

  static getConflict(filePath: string): ConflictDetails | null {
    return this.conflicts.get(normalizePath(filePath)) ?? null;
  }

  static clearConflict(filePath: string): void {
    const norm = normalizePath(filePath);
    this.conflicts.delete(norm);
    this.editorBridge?.clearConflict?.(norm);
  }

  /**
   * Resets internal bridge/scope state cleanly (intended for test suites).
   */
  static resetStateForTests(): void {
    this.editorBridge = null;
    this.activeWorkspaceRoot = null;
    this.workspaceGeneration = 0;
    this.conflicts.clear();
  }

  private static validatePathInScope(rawPath: string): { valid: true; norm: string } | { valid: false; error: string } {
    this.ensureLifecycleSubscribed();
    const norm = normalizePath(rawPath);
    if (hasPathTraversalOrUnsafeChars(rawPath, norm)) {
      return {
        valid: false,
        error: `Invalid path: directory traversal or unsafe path format is not permitted ('${rawPath}').`,
      };
    }

    if (this.activeWorkspaceRoot && !isDescendant(this.activeWorkspaceRoot, norm)) {
      return {
        valid: false,
        error: `Access denied: '${norm}' is outside the authorized workspace '${this.activeWorkspaceRoot}'.`,
      };
    }

    return { valid: true, norm };
  }

  private static findEditorDocument(filePath: string): EditorDocumentSnapshot | null {
    if (!this.editorBridge) return null;
    const norm = normalizePath(filePath);
    const docs = this.editorBridge.getDocuments();
    return docs.find((d) => normalizePath(d.path) === norm) ?? null;
  }

  private static recordConflict(conflict: ConflictDetails): void {
    const norm = normalizePath(conflict.path);
    this.conflicts.set(norm, conflict);
    this.editorBridge?.reportConflict?.(conflict);
    ideEvents.emit("editor:buffer-conflict", {
      path: norm,
      type: conflict.type,
      message: conflict.message,
    });
  }

  private static async readDiskState(normPath: string): Promise<DiskReadState> {
    try {
      const res = await readFileContent(normPath);
      return {
        exists: true,
        content: res.content ?? "",
        isBinary: Boolean(res.isBinary),
        readonly: Boolean(res.readonly),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isNotFoundErrorMessage(msg)) {
        return {
          exists: false,
          content: "",
          isBinary: false,
          readonly: false,
        };
      }
      return {
        exists: false,
        content: "",
        isBinary: false,
        readonly: false,
        accessError: msg,
      };
    }
  }

  /**
   * 1. Determines whether a file is currently open in a live Monaco model or EditorContext tab.
   */
  static isDocumentOpen(filePath: string): boolean {
    return ModelService.hasModel(filePath) || this.findEditorDocument(filePath) !== null;
  }

  /**
   * 2. Retrieves current in-memory content of an open non-disposed Monaco model or editor document.
   */
  static getBufferContent(filePath: string): string | null {
    const model = ModelService.getModel(filePath);
    if (model && (typeof model.isDisposed !== "function" || !model.isDisposed())) {
      return model.getValue();
    }
    const doc = this.findEditorDocument(filePath);
    return doc ? doc.content : null;
  }

  /**
   * 3. Reads current content directly from the filesystem.
   */
  static async getDiskContent(filePath: string): Promise<string> {
    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) {
      throw new Error(validated.error);
    }
    const state = await this.readDiskState(validated.norm);
    if (state.accessError) {
      throw new Error(state.accessError);
    }
    return state.content;
  }

  /**
   * 4. Checks whether the file has unsaved in-memory changes compared to saved/disk state.
   */
  static async isDocumentDirty(filePath: string, diskContent?: string): Promise<boolean> {
    if (!this.isDocumentOpen(filePath)) return false;

    const doc = this.findEditorDocument(filePath);
    const buffer = this.getBufferContent(filePath);
    if (buffer === null) return Boolean(doc?.isDirty);

    if (doc && (doc.isDirty || buffer !== doc.savedContent)) {
      return true;
    }

    if (diskContent !== undefined) {
      return buffer !== diskContent;
    }

    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) return Boolean(doc?.isDirty);

    const diskState = await this.readDiskState(validated.norm);
    if (!diskState.exists) {
      return Boolean(doc?.isDirty);
    }
    return buffer !== diskState.content;
  }

  /**
   * 5. Retrieves the document version ID (Monaco versionId or deterministic buffer snapshot hash).
   */
  static getDocumentVersion(filePath: string): number | string | null {
    const versionId = ModelService.getVersionId(filePath);
    if (versionId !== null) return versionId;

    const buffer = this.getBufferContent(filePath);
    if (buffer !== null) {
      let hash = 2166136261;
      for (let i = 0; i < buffer.length; i++) {
        hash ^= buffer.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `hash_${buffer.length}_${hash >>> 0}`;
    }
    return null;
  }

  /**
   * 6. Compares in-memory buffer with disk content accurately.
   */
  static async compareBufferWithDisk(filePath: string): Promise<CompareResult> {
    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) {
      return {
        isOpen: false,
        isDirty: false,
        bufferContent: null,
        diskContent: "",
        fileExistsOnDisk: false,
        version: null,
        matches: false,
        error: validated.error,
      };
    }

    const norm = validated.norm;
    const isOpen = this.isDocumentOpen(norm);
    const doc = this.findEditorDocument(norm);
    const diskState = await this.readDiskState(norm);
    const bufferContent = isOpen ? this.getBufferContent(norm) : null;
    const version = isOpen ? this.getDocumentVersion(norm) : null;

    const isDirty = Boolean(
      isOpen &&
        bufferContent !== null &&
        ((doc && (doc.isDirty || bufferContent !== doc.savedContent)) ||
          (diskState.exists && bufferContent !== diskState.content))
    );
    const matches = isOpen ? diskState.exists && bufferContent === diskState.content : true;

    return {
      isOpen,
      isDirty,
      bufferContent,
      diskContent: diskState.content,
      fileExistsOnDisk: diskState.exists,
      version,
      matches,
      error: diskState.accessError,
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
    expectedVersion?: number | string | null;
  }): Promise<PrepareChangeResult> {
    const validated = this.validatePathInScope(params.path);
    if (!validated.valid) {
      const diff = DiffService.createFileDiff({
        path: normalizePath(params.path),
        oldContent: "",
        newContent: params.proposedContent,
        type: "modify",
      });
      diff.status = "failed";
      diff.error = validated.error;
      return {
        allowed: false,
        diff,
        conflict: null,
        version: null,
        currentBuffer: null,
        currentDisk: "",
        error: validated.error,
      };
    }

    const opGen = this.workspaceGeneration;
    const norm = validated.norm;
    const compare = await this.compareBufferWithDisk(norm);

    if (this.workspaceGeneration !== opGen) {
      const staleError = "Workspace changed while preparing buffer change.";
      const diff = DiffService.createFileDiff({
        path: norm,
        oldContent: compare.bufferContent ?? compare.diskContent,
        newContent: params.proposedContent,
        type: "modify",
      });
      diff.status = "failed";
      diff.error = staleError;
      return {
        allowed: false,
        diff,
        conflict: null,
        version: compare.version,
        currentBuffer: compare.bufferContent,
        currentDisk: compare.diskContent,
        error: staleError,
      };
    }

    if (compare.error) {
      const diff = DiffService.createFileDiff({
        path: norm,
        oldContent: compare.bufferContent ?? "",
        newContent: params.proposedContent,
        type: "modify",
      });
      diff.status = "failed";
      diff.error = compare.error;
      return {
        allowed: false,
        diff,
        conflict: null,
        version: compare.version,
        currentBuffer: compare.bufferContent,
        currentDisk: "",
        error: compare.error,
      };
    }

    const doc = this.findEditorDocument(norm);
    if (doc?.isBinary || doc?.readonly) {
      const reason = doc.isBinary
        ? `Cannot modify binary file '${norm}'.`
        : `Cannot modify readonly file '${norm}'.`;
      const diff = DiffService.createFileDiff({
        path: norm,
        oldContent: compare.bufferContent ?? compare.diskContent,
        newContent: params.proposedContent,
        type: "modify",
      });
      diff.status = "failed";
      diff.error = reason;
      return {
        allowed: false,
        diff,
        conflict: null,
        version: compare.version,
        currentBuffer: compare.bufferContent,
        currentDisk: compare.diskContent,
        error: reason,
      };
    }

    let conflict: ConflictDetails | null = null;
    if (
      params.expectedVersion !== undefined &&
      params.expectedVersion !== null &&
      compare.version !== null &&
      compare.version !== params.expectedVersion
    ) {
      conflict = {
        type: "version_mismatch",
        message: `Document version changed for '${norm}': expected ${params.expectedVersion}, found ${compare.version}.`,
        path: norm,
        baseContent: params.baseContent,
        currentContent: compare.bufferContent ?? compare.diskContent,
        timestamp: Date.now(),
      };
    } else {
      conflict = DiffService.detectConflict({
        path: norm,
        baseContent: params.baseContent,
        currentBuffer: compare.bufferContent,
        currentDisk: compare.diskContent,
        isDirty: compare.isDirty,
        fileExistsOnDisk: compare.fileExistsOnDisk,
        expectedToExist: true,
      });
    }

    const currentBase =
      compare.isOpen && compare.bufferContent !== null
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
      this.recordConflict(conflict);
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
   * synchronizes the model, EditorContext.documents, and disk, and verifies contents
   * (Steps 8 through 10 of the protocol).
   */
  static async applyChange(options: ApplyChangeOptions): Promise<ApplyChangeResult> {
    const validated = this.validatePathInScope(options.path);
    if (!validated.valid) {
      return {
        success: false,
        verified: false,
        error: validated.error,
      };
    }

    const opGen = this.workspaceGeneration;
    const norm = validated.norm;
    const preserveUndo = options.preserveUndo ?? true;
    const autoSave = options.autoSave ?? true;
    const preserveLineEndings = options.preserveLineEndings ?? true;

    const doc = this.findEditorDocument(norm);
    if (doc?.isBinary) {
      return { success: false, verified: false, error: `Cannot edit binary file '${norm}'.` };
    }
    if (doc?.readonly) {
      return { success: false, verified: false, error: `Cannot edit readonly file '${norm}'.` };
    }

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

    const hasLiveModel = ModelService.hasModel(norm);
    const hasOpenTab = this.isDocumentOpen(norm);
    const previousBuffer = hasOpenTab ? this.getBufferContent(norm) : null;
    const previousSavedContent = doc?.savedContent ?? null;

    // Preserve line endings relative to existing buffer or disk content when requested
    let referenceContent = previousBuffer;
    if (referenceContent === null) {
      const initialDisk = await this.readDiskState(norm);
      if (this.workspaceGeneration !== opGen) {
        return {
          success: false,
          verified: false,
          error: "Workspace changed during buffer synchronization operation.",
        };
      }
      if (initialDisk.accessError) {
        return {
          success: false,
          verified: false,
          error: initialDisk.accessError,
        };
      }
      if (!initialDisk.exists) {
        return {
          success: false,
          verified: false,
          error: `Target file does not exist on disk: '${norm}'.`,
        };
      }
      if (initialDisk.isBinary || initialDisk.readonly) {
        return {
          success: false,
          verified: false,
          error: initialDisk.isBinary
            ? `Cannot edit binary file '${norm}'.`
            : `Cannot edit readonly file '${norm}'.`,
        };
      }
      referenceContent = initialDisk.content;
    }

    const finalContent = preserveLineEndings
      ? matchLineEndingStyle(referenceContent, options.newContent)
      : options.newContent;

    try {
      // 8. Apply the change to open Monaco model (if mounted) & connected EditorContext
      if (hasLiveModel) {
        const appliedToModel = ModelService.applyEdit(norm, finalContent, preserveUndo);
        if (!appliedToModel) {
          throw new Error(`Failed to apply edit to active Monaco model for '${norm}'`);
        }
      }

      if (doc) {
        this.editorBridge?.applySyncToDocument(norm, finalContent, { saved: false });
      }

      // 9. Synchronize disk when autoSave is enabled
      if (autoSave) {
        if (this.workspaceGeneration !== opGen) {
          throw new Error("Workspace changed before disk save.");
        }
        await EditorService.saveDocument(norm, finalContent);
        if (this.workspaceGeneration !== opGen) {
          throw new Error("Workspace changed after disk save.");
        }
        if (doc) {
          this.editorBridge?.applySyncToDocument(norm, finalContent, { saved: true });
        }
        this.clearConflict(norm);
        ideEvents.emit("editor:document-saved", { path: norm });
        ideEvents.emit("editor:document-changed", { path: norm, isDirty: false });
        ideEvents.emit("file:content-changed", { path: norm, content: finalContent });
      } else {
        const dirtyNow = previousSavedContent !== null ? finalContent !== previousSavedContent : true;
        ideEvents.emit("editor:document-changed", { path: norm, isDirty: dirtyNow });
      }

      // 10. Verify resulting contents
      const verifyDisk = autoSave ? await this.getDiskContent(norm) : finalContent;
      if (this.workspaceGeneration !== opGen) {
        throw new Error("Workspace changed during verification.");
      }
      const verifyModel = hasLiveModel ? this.getBufferContent(norm) : finalContent;

      const diskMatches = verifyDisk === finalContent;
      const modelMatches = verifyModel === finalContent;
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

      // Rollback in-memory state cleanly when save/verification fails (unless workspace closed)
      if (this.workspaceGeneration === opGen) {
        if (hasLiveModel && previousBuffer !== null) {
          ModelService.applyEdit(norm, previousBuffer, false);
        }
        if (doc && previousBuffer !== null) {
          this.editorBridge?.applySyncToDocument(norm, previousBuffer, {
            saved: previousSavedContent !== null && previousBuffer === previousSavedContent,
          });
        }
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
    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) {
      return { success: false, error: validated.error };
    }

    const opGen = this.workspaceGeneration;
    const norm = validated.norm;

    if (this.isDocumentOpen(norm)) {
      return { success: false, error: `Document '${norm}' is already open in editor.` };
    }

    try {
      const diskState = await this.readDiskState(norm);
      if (this.workspaceGeneration !== opGen) {
        return { success: false, error: "Workspace changed during file creation." };
      }
      if (diskState.accessError) {
        return { success: false, error: diskState.accessError };
      }
      if (diskState.exists) {
        return { success: false, error: `File '${norm}' already exists on disk.` };
      }

      await writeFileContent(norm, initialContent);
      if (this.workspaceGeneration !== opGen) {
        return { success: false, error: "Workspace changed after file creation." };
      }

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
   * Safely deletes a file via native `fs_delete` before disposing open Monaco models.
   */
  static async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) {
      return { success: false, error: validated.error };
    }

    const opGen = this.workspaceGeneration;
    const norm = validated.norm;

    try {
      // Execute disk deletion first so failed IPC never orphans or disposes open editor tabs
      await invokeCommand<void>("fs_delete", { path: norm, isDir: false });

      if (this.workspaceGeneration !== opGen) {
        return { success: false, error: "Workspace changed during file deletion." };
      }

      this.clearConflict(norm);
      if (this.isDocumentOpen(norm)) {
        ModelService.disposePath(norm);
        ideEvents.emit("editor:document-closed", { path: norm });
      }

      ideEvents.emit("file:deleted", { path: norm, isDirectory: false });
      ideEvents.emit("files:deleted", { paths: [norm] });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Safely renames or moves a file via native `fs_rename` before migrating Monaco models.
   */
  static async renameFile(
    oldPath: string,
    newPath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco?: any
  ): Promise<{ success: boolean; error?: string }> {
    const validatedOld = this.validatePathInScope(oldPath);
    if (!validatedOld.valid) {
      return { success: false, error: validatedOld.error };
    }
    const validatedNew = this.validatePathInScope(newPath);
    if (!validatedNew.valid) {
      return { success: false, error: validatedNew.error };
    }

    const opGen = this.workspaceGeneration;
    const normOld = validatedOld.norm;
    const normNew = validatedNew.norm;

    try {
      // Execute disk rename first so failed IPC never desynchronizes editor models
      await invokeCommand<void>("fs_rename", { oldPath: normOld, newPath: normNew });

      if (this.workspaceGeneration !== opGen) {
        return { success: false, error: "Workspace changed during file rename." };
      }

      this.clearConflict(normOld);
      if (ModelService.hasModel(normOld)) {
        ModelService.renamePath(normOld, normNew, monaco);
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
   * Reverts an open dirty editor buffer to current disk content.
   */
  static async revertBufferToDisk(filePath: string): Promise<boolean> {
    const validated = this.validatePathInScope(filePath);
    if (!validated.valid) return false;

    const opGen = this.workspaceGeneration;
    const norm = validated.norm;
    if (!this.isDocumentOpen(norm)) return false;

    const diskState = await this.readDiskState(norm);
    if (this.workspaceGeneration !== opGen || !diskState.exists || diskState.accessError) {
      return false;
    }

    let applied = true;
    if (ModelService.hasModel(norm)) {
      applied = ModelService.applyEdit(norm, diskState.content, true);
    }
    if (applied) {
      this.editorBridge?.applySyncToDocument(norm, diskState.content, { saved: true });
      this.clearConflict(norm);
      ideEvents.emit("editor:document-changed", { path: norm, isDirty: false });
    }
    return applied;
  }
}
