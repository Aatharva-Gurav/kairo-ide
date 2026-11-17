import { normalizePath, readFileContent } from "@/lib/tauri-ipc";
import { ModelService } from "@/features/editor/services/model.service";
import { EditorService } from "@/features/editor/services/editor.service";
import { BufferSyncService } from "@/features/editor/services/buffer-sync.service";
import { FileDiff, MultiFileDiff } from "@/lib/diff/types";
import { ideEvents } from "@/lib/events";

export interface CheckpointFileEntry {
  path: string;
  originalContent: string | null;
  newContent: string | null;
  originalHash: string;
  newHash?: string;
  wasOpen: boolean;
  wasDirty: boolean;
  diff?: FileDiff;
  metadata?: {
    size?: number;
    timestamp?: number;
    language?: string;
  };
}

export interface Checkpoint {
  id: string;
  sessionId?: string;
  taskId?: string;
  label: string;
  description?: string;
  createdAt: number;
  restoredAt?: number;
  entries: Record<string, CheckpointFileEntry>;
  status: "active" | "restored" | "partially_restored" | "discarded";
}

export interface RestoreOptions {
  filePaths?: string[];
  preserveUndo?: boolean;
  autoSave?: boolean;
}

export interface RestoreResult {
  success: boolean;
  checkpointId: string;
  restoredFiles: string[];
  failedFiles: Array<{ path: string; error: string }>;
}

export interface ICheckpointStorage {
  save(checkpoint: Checkpoint): Promise<void>;
  get(id: string): Promise<Checkpoint | null>;
  list(sessionId?: string): Promise<Checkpoint[]>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class InMemoryCheckpointStorage implements ICheckpointStorage {
  private readonly checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, JSON.parse(JSON.stringify(checkpoint)));
  }

  async get(id: string): Promise<Checkpoint | null> {
    const cp = this.checkpoints.get(id);
    return cp ? JSON.parse(JSON.stringify(cp)) : null;
  }

  async list(sessionId?: string): Promise<Checkpoint[]> {
    const all = Array.from(this.checkpoints.values());
    if (!sessionId) return all;
    return all.filter((cp) => cp.sessionId === sessionId);
  }

  async delete(id: string): Promise<boolean> {
    return this.checkpoints.delete(id);
  }

  async clear(): Promise<void> {
    this.checkpoints.clear();
  }
}

/**
 * Git-Independent Checkpoint Service.
 * Preserves original file contents, metadata, and diff patches.
 * Supports safe full or partial rollback with Monaco model buffer synchronization.
 */
export class CheckpointService {
  private readonly storage: ICheckpointStorage;

  constructor(storage?: ICheckpointStorage) {
    this.storage = storage ?? new InMemoryCheckpointStorage();
  }

  /**
   * Computes a content fingerprint.
   */
  static computeFingerprint(content: string | null): string {
    if (content === null) return "none";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(16)}_${content.length}`;
  }

  /**
   * Creates a checkpoint preserving current disk and in-memory editor states.
   */
  async createCheckpoint(params: {
    label: string;
    filePaths: string[];
    sessionId?: string;
    taskId?: string;
    description?: string;
  }): Promise<Checkpoint> {
    const id = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const entries: Record<string, CheckpointFileEntry> = {};

    for (const rawPath of params.filePaths) {
      const norm = normalizePath(rawPath);
      const wasOpen = BufferSyncService.isDocumentOpen(norm);
      const bufferContent = wasOpen ? BufferSyncService.getBufferContent(norm) : null;
      let diskContent: string | null = null;
      let fileExists = true;

      try {
        const fileRes = await readFileContent(norm);
        diskContent = fileRes.content || "";
      } catch {
        fileExists = false;
        diskContent = null;
      }

      // If file was not on disk and not in buffer, originalContent is null (new file)
      const originalContent = wasOpen && bufferContent !== null
        ? bufferContent
        : diskContent;

      const wasDirty = wasOpen && bufferContent !== null && fileExists && bufferContent !== diskContent;

      entries[norm] = {
        path: norm,
        originalContent,
        newContent: null,
        originalHash: CheckpointService.computeFingerprint(originalContent),
        wasOpen,
        wasDirty,
        metadata: {
          size: originalContent ? originalContent.length : 0,
          timestamp: Date.now(),
        },
      };
    }

    const checkpoint: Checkpoint = {
      id,
      sessionId: params.sessionId,
      taskId: params.taskId,
      label: params.label,
      description: params.description,
      createdAt: Date.now(),
      entries,
      status: "active",
    };

    await this.storage.save(checkpoint);
    return checkpoint;
  }

  /**
   * Records proposed or applied diff patches against an existing checkpoint.
   */
  async recordDiff(checkpointId: string, diff: FileDiff | MultiFileDiff): Promise<void> {
    const checkpoint = await this.storage.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }

    const fileDiffs = "files" in diff ? diff.files : [diff];

    for (const fd of fileDiffs) {
      const norm = normalizePath(fd.path);
      const existing = checkpoint.entries[norm];
      if (existing) {
        existing.diff = fd;
        existing.newContent = fd.newContent;
        existing.newHash = CheckpointService.computeFingerprint(fd.newContent);
      } else {
        checkpoint.entries[norm] = {
          path: norm,
          originalContent: fd.oldContent,
          newContent: fd.newContent,
          originalHash: CheckpointService.computeFingerprint(fd.oldContent),
          newHash: CheckpointService.computeFingerprint(fd.newContent),
          wasOpen: BufferSyncService.isDocumentOpen(norm),
          wasDirty: false,
          diff: fd,
          metadata: {
            size: fd.newContent ? fd.newContent.length : 0,
            timestamp: Date.now(),
          },
        };
      }
    }

    await this.storage.save(checkpoint);
  }

  /**
   * Restores files to their exact pre-modification state recorded in the checkpoint.
   * Restores both disk and active Monaco models seamlessly.
   */
  async restoreCheckpoint(
    checkpointId: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const checkpoint = await this.storage.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }

    const preserveUndo = options?.preserveUndo ?? true;
    const autoSave = options?.autoSave ?? true;
    const targetPaths = options?.filePaths
      ? new Set(options.filePaths.map((p) => normalizePath(p)))
      : null;

    const restoredFiles: string[] = [];
    const failedFiles: Array<{ path: string; error: string }> = [];

    for (const [filePath, entry] of Object.entries(checkpoint.entries)) {
      if (targetPaths && !targetPaths.has(filePath)) {
        continue;
      }

      try {
        if (entry.originalContent === null) {
          // File was newly created by agent -> delete it
          await BufferSyncService.deleteFile(filePath);
          restoredFiles.push(filePath);
        } else {
          // File was modified or deleted by agent -> restore original content
          const wasOpen = BufferSyncService.isDocumentOpen(filePath);

          // Update Monaco model if open
          if (wasOpen) {
            ModelService.applyEdit(filePath, entry.originalContent, preserveUndo);
          }

          // Restore to disk
          if (autoSave) {
            await EditorService.saveDocument(filePath, entry.originalContent);
            ideEvents.emit("editor:document-saved", { path: filePath });
            ideEvents.emit("editor:document-changed", { path: filePath, isDirty: false });
            ideEvents.emit("file:content-changed", { path: filePath, content: entry.originalContent });
          }

          restoredFiles.push(filePath);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failedFiles.push({ path: filePath, error: msg });
      }
    }

    checkpoint.restoredAt = Date.now();
    checkpoint.status = failedFiles.length === 0 ? "restored" : "partially_restored";
    await this.storage.save(checkpoint);

    return {
      success: failedFiles.length === 0,
      checkpointId,
      restoredFiles,
      failedFiles,
    };
  }

  async listCheckpoints(sessionId?: string): Promise<Checkpoint[]> {
    return this.storage.list(sessionId);
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.storage.get(id);
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }
}
