/**
 * Sidecar Checkpoint Coordinator for Kairo AI Agent.
 *
 * Preserves file snapshots, content hashes, and metadata before mutating operations.
 * Operates independently of Git, enabling fast and safe rollbacks during Act Mode.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Logger } from "../utils/logger";

export interface CheckpointFileSnapshot {
  path: string;
  exists: boolean;
  content: string | null;
  hash: string;
  size: number;
  timestamp: number;
}

export interface SidecarCheckpoint {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  restoredAt?: number;
  files: Record<string, CheckpointFileSnapshot>;
  status: "active" | "restored" | "partially_restored" | "discarded";
}

export interface SidecarRestoreResult {
  success: boolean;
  checkpointId: string;
  restoredFiles: string[];
  failedFiles: Array<{ path: string; error: string }>;
}

export class CheckpointCoordinator {
  private readonly checkpoints = new Map<string, SidecarCheckpoint>();
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ? logger.child("checkpoint-coordinator") : new Logger("checkpoint-coordinator");
  }

  public static computeHash(content: string | null): string {
    if (content === null) return "none";
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * Captures a snapshot of the specified files.
   */
  public async createCheckpoint(
    sessionId: string,
    label: string,
    filePaths: string[]
  ): Promise<SidecarCheckpoint> {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const files: Record<string, CheckpointFileSnapshot> = {};

    for (const rawPath of filePaths) {
      const normalized = path.resolve(rawPath);
      try {
        const stat = await fs.stat(normalized).catch(() => null);
        if (stat && stat.isFile()) {
          const content = await fs.readFile(normalized, "utf8");
          files[normalized] = {
            path: normalized,
            exists: true,
            content,
            hash: CheckpointCoordinator.computeHash(content),
            size: stat.size,
            timestamp: stat.mtimeMs,
          };
        } else {
          files[normalized] = {
            path: normalized,
            exists: false,
            content: null,
            hash: "none",
            size: 0,
            timestamp: Date.now(),
          };
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed reading snapshot for file: ${normalized}`, errorMsg);
        files[normalized] = {
          path: normalized,
          exists: false,
          content: null,
          hash: "none",
          size: 0,
          timestamp: Date.now(),
        };
      }
    }

    const checkpoint: SidecarCheckpoint = {
      id,
      sessionId,
      label,
      createdAt: Date.now(),
      files,
      status: "active",
    };

    this.checkpoints.set(id, checkpoint);
    this.logger.info(`Created checkpoint ${id} ('${label}') with ${Object.keys(files).length} files`);
    return checkpoint;
  }

  /**
   * Restores files to their state recorded in the checkpoint.
   */
  public async restoreCheckpoint(
    checkpointId: string,
    targetFilePaths?: string[]
  ): Promise<SidecarRestoreResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return {
        success: false,
        checkpointId,
        restoredFiles: [],
        failedFiles: [{ path: "*", error: `Checkpoint '${checkpointId}' not found.` }],
      };
    }

    const restoredFiles: string[] = [];
    const failedFiles: Array<{ path: string; error: string }> = [];

    const fileEntries = Object.values(checkpoint.files).filter((file) => {
      if (!targetFilePaths || targetFilePaths.length === 0) return true;
      return targetFilePaths.some((p) => path.resolve(p) === file.path);
    });

    for (const file of fileEntries) {
      try {
        if (!file.exists) {
          // File did not exist when checkpoint was created: delete it if currently exists
          const stat = await fs.stat(file.path).catch(() => null);
          if (stat) {
            await fs.unlink(file.path);
          }
        } else if (file.content !== null) {
          // Ensure directory exists
          await fs.mkdir(path.dirname(file.path), { recursive: true });
          await fs.writeFile(file.path, file.content, "utf8");
        }
        restoredFiles.push(file.path);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        failedFiles.push({ path: file.path, error: errorMsg });
      }
    }

    const success = failedFiles.length === 0;
    checkpoint.restoredAt = Date.now();
    checkpoint.status = success
      ? (targetFilePaths && targetFilePaths.length < Object.keys(checkpoint.files).length
          ? "partially_restored"
          : "restored")
      : "partially_restored";

    this.logger.info(
      `Restored checkpoint ${checkpointId}: ${restoredFiles.length} restored, ${failedFiles.length} failed`
    );

    return {
      success,
      checkpointId,
      restoredFiles,
      failedFiles,
    };
  }

  public getCheckpoint(id: string): SidecarCheckpoint | null {
    return this.checkpoints.get(id) || null;
  }

  public listCheckpoints(sessionId?: string): SidecarCheckpoint[] {
    const all = Array.from(this.checkpoints.values());
    if (!sessionId) return all;
    return all.filter((cp) => cp.sessionId === sessionId);
  }

  public deleteCheckpoint(id: string): boolean {
    return this.checkpoints.delete(id);
  }

  public clear(): void {
    this.checkpoints.clear();
  }
}
