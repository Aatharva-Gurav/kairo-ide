/**
 * Kairo Session Metadata Store.
 *
 * Provides transactional, atomic persistence for Kairo-specific session metadata
 * in ~/.kairo/sessions/<sessionId>.meta.json.
 *
 * Guarantees:
 * - Atomic writes via temporary files and rename to avoid partial corruption.
 * - Zero secrets: strictly strips and blocks API keys/tokens.
 * - Graceful corruption quarantine (.corrupt.<timestamp>).
 * - Versioned schema migration.
 * - Automatic interrupted task reconciliation upon restart.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Logger } from "../utils/logger";
import {
  KairoSessionMetadata,
  KairoSessionMetadataSchema,
} from "../../lib/ai-agent/persistence-schema";

export interface SessionMetadataStoreOptions {
  sessionsDir?: string;
  baseDir?: string;
  logger?: Logger;
}

export class SessionMetadataStore {
  private sessionsDir: string;
  private readonly logger: Logger;
  private initialized = false;

  constructor(options: SessionMetadataStoreOptions = {}) {
    this.sessionsDir =
      options.sessionsDir ||
      options.baseDir ||
      process.env.KAIRO_SESSIONS_DIR ||
      path.join(os.homedir(), ".kairo", "sessions");
    this.logger = options.logger
      ? options.logger.child("session-metadata-store")
      : new Logger("session-metadata-store");
  }

  public getSessionsDir(): string {
    return this.sessionsDir;
  }

  public async ensureDirectory(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
      this.initialized = true;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        // Fallback to temp directory if home dir is restricted by sandbox or permissions
        const fallback = path.join(os.tmpdir(), ".kairo", "sessions");
        if (this.sessionsDir !== fallback) {
          this.logger.warn(
            `Permission denied creating sessions dir at ${this.sessionsDir}, falling back to ${fallback}`
          );
          this.sessionsDir = fallback;
          await fs.mkdir(this.sessionsDir, { recursive: true });
          this.initialized = true;
          return;
        }
      }
      this.logger.error(`Failed to create sessions directory: ${this.sessionsDir}`, err);
      throw err;
    }
  }

  public getMetadataFilePath(sessionId: string): string {
    return this.getMetadataPath(sessionId);
  }

  public getMetadataPath(sessionId: string): string {
    // Sanitize sessionId for filesystem safety
    const safeId = sessionId.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    return path.join(this.sessionsDir, `${safeId}.meta.json`);
  }

  /**
   * Asserts that no credentials or secrets are stored in metadata.
   */
  private assertNoSecrets(metadata: unknown): void {
    const raw = JSON.stringify(metadata);
    const sensitiveKeys = [
      "apikey",
      "api_key",
      "secretkey",
      "secrettoken",
      "authtoken",
      "password",
      "authorization",
      "credential",
    ];

    const lower = raw.toLowerCase();
    for (const key of sensitiveKeys) {
      if (lower.includes(`"${key}"`) || lower.includes(`"${key.toLowerCase()}"`)) {
        throw new Error(
          `Metadata contains forbidden secret key: '${key}'. Secrets must never be persisted in session metadata.`
        );
      }
    }
  }

  /**
   * Asserts and sanitizes that no credentials or secrets are stored in metadata.
   */
  private sanitizeMetadata(metadata: KairoSessionMetadata): KairoSessionMetadata {
    this.assertNoSecrets(metadata);
    const cloned = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
    return cloned as unknown as KairoSessionMetadata;
  }

  /**
   * Migrate legacy or unversioned metadata formats to current version (1).
   */
  public migrateMetadata(raw: Record<string, unknown>): KairoSessionMetadata {
    const version = typeof raw.version === "number" ? raw.version : 1;
    const now = Date.now();

    const migrated: Record<string, unknown> = {
      version: 1,
      conversationId: raw.conversationId || raw.sessionId || `conv_${now}`,
      clineSessionId: raw.clineSessionId || raw.sessionId || `sess_${now}`,
      taskId: raw.taskId || raw.sessionId || `task_${now}`,
      workspaceId: raw.workspaceId || "default",
      workspacePath: raw.workspacePath || raw.workspace || process.cwd(),
      providerId: raw.providerId || "anthropic",
      modelId: raw.modelId || "claude-3-7-sonnet-20250219",
      title: raw.title || "Untitled Conversation",
      customTitle: raw.customTitle,
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
      lastActivityAt: raw.lastActivityAt || raw.updatedAt || now,
      status: raw.status || "idle",
      taskState: raw.taskState || "idle",
      mode: raw.mode === "plan" ? "plan" : "act",
      plan: raw.plan,
      unresolvedApproval: raw.unresolvedApproval,
      interruptedAt: raw.interruptedAt,
      interruptedReason: raw.interruptedReason,
      totalCost: typeof raw.totalCost === "number" ? raw.totalCost : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
    };

    return KairoSessionMetadataSchema.parse(migrated);
  }

  /**
   * Atomically save session metadata to disk.
   */
  public async saveMetadata(metadata: KairoSessionMetadata): Promise<void> {
    await this.ensureDirectory();

    const sanitized = this.sanitizeMetadata(metadata);
    const validated = KairoSessionMetadataSchema.parse(sanitized);
    const destPath = this.getMetadataPath(validated.clineSessionId);

    // Atomic write pattern: write to tmp file then rename
    const tmpPath = `${destPath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;

    try {
      await fs.writeFile(tmpPath, JSON.stringify(validated, null, 2), "utf8");
      await fs.rename(tmpPath, destPath);
      this.logger.debug(`Saved metadata for session ${validated.clineSessionId}`);
    } catch (err) {
      // Clean up tmp file on error
      await fs.unlink(tmpPath).catch(() => {});
      this.logger.error(`Failed to atomically write metadata for session ${validated.clineSessionId}`, err);
      throw err;
    }
  }

  /**
   * Load session metadata by session ID.
   * Quarantines corrupted files to prevent crashing.
   */
  public async getMetadata(sessionId: string): Promise<KairoSessionMetadata | null> {
    await this.ensureDirectory();
    const filePath = this.getMetadataPath(sessionId);

    try {
      const content = await fs.readFile(filePath, "utf8");
      const raw = JSON.parse(content);
      return this.migrateMetadata(raw);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error && error.code === "ENOENT") {
        return null;
      }

      // Handle corrupted JSON
      this.logger.warn(`Corrupted session metadata detected for ${sessionId}: ${error.message}`);
      const corruptPath = `${filePath}.corrupt.${Date.now()}`;
      try {
        await fs.rename(filePath, corruptPath);
        this.logger.info(`Quarantined corrupted metadata to: ${corruptPath}`);
      } catch {
        // ignore rename error
      }
      return null;
    }
  }

  /**
   * List all stored session metadata, ordered by lastActivityAt descending.
   */
  public async listMetadata(): Promise<KairoSessionMetadata[]> {
    await this.ensureDirectory();

    try {
      const files = await fs.readdir(this.sessionsDir);
      const results: KairoSessionMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith(".meta.json")) continue;
        const filePath = path.join(this.sessionsDir, file);

        try {
          const content = await fs.readFile(filePath, "utf8");
          const raw = JSON.parse(content);
          const meta = this.migrateMetadata(raw);
          results.push(meta);
        } catch (err) {
          this.logger.warn(`Skipping unreadable metadata file ${file}`, err);
        }
      }

      return results.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    } catch (err) {
      this.logger.error("Failed to list session metadata files", err);
      return [];
    }
  }

  /**
   * Delete session metadata file.
   */
  public async deleteMetadata(sessionId: string): Promise<boolean> {
    await this.ensureDirectory();
    const filePath = this.getMetadataPath(sessionId);

    try {
      await fs.unlink(filePath);
      this.logger.info(`Deleted metadata for session ${sessionId}`);
      return true;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error && error.code === "ENOENT") {
        return false;
      }
      this.logger.error(`Failed to delete metadata for session ${sessionId}`, err);
      return false;
    }
  }

  /**
   * Rename conversation title in metadata.
   */
  public async renameMetadata(
    sessionId: string,
    newTitle: string
  ): Promise<KairoSessionMetadata | null> {
    const existing = await this.getMetadata(sessionId);
    if (!existing) {
      return null;
    }

    existing.title = newTitle;
    existing.customTitle = newTitle;
    existing.updatedAt = Date.now();

    await this.saveMetadata(existing);
    return existing;
  }

  /**
   * Search metadata across titles, objectives, understanding, relevant files, tags, and summary.
   */
  public async searchMetadata(query: string, limit: number = 50): Promise<KairoSessionMetadata[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const all = await this.listMetadata();
    const matched = all.filter((meta) => {
      if (meta.title.toLowerCase().includes(q)) return true;
      if (meta.customTitle?.toLowerCase().includes(q)) return true;
      if (meta.summary?.toLowerCase().includes(q)) return true;
      if (meta.workspacePath.toLowerCase().includes(q)) return true;
      if (meta.tags?.some((t) => t.toLowerCase().includes(q))) return true;
      if (meta.plan) {
        if (meta.plan.objective.toLowerCase().includes(q)) return true;
        if (meta.plan.understanding.toLowerCase().includes(q)) return true;
        if (meta.plan.relevantFiles.some((f) => f.toLowerCase().includes(q))) return true;
      }
      return false;
    });

    return matched.slice(0, limit);
  }

  /**
   * Reconcile interrupted sessions after application restart.
   *
   * Detects sessions that were active or in mid-execution when process died.
   * Sets status to 'interrupted' and marks any pending approval for reauthorization.
   * Never assumes completion.
   */
  public async reconcileInterruptedSessions(): Promise<string[]> {
    const all = await this.listMetadata();
    const interruptedIds: string[] = [];

    for (const meta of all) {
      const wasActive =
        meta.status === "active" ||
        meta.taskState === "executing" ||
        meta.taskState === "planning" ||
        meta.taskState === "awaiting_tool_approval" ||
        meta.taskState === "verifying";

      if (wasActive) {
        this.logger.warn(
          `Reconciling interrupted session ${meta.clineSessionId} (previous status: ${meta.status}, taskState: ${meta.taskState})`
        );

        meta.status = "interrupted";
        meta.taskState = "interrupted";
        meta.interruptedAt = Date.now();
        meta.interruptedReason =
          "Application or agent process restarted while task execution was in progress.";

        if (meta.unresolvedApproval) {
          meta.unresolvedApproval.status = "interrupted_requires_reauthorization";
        }

        await this.saveMetadata(meta);
        interruptedIds.push(meta.clineSessionId);
      }
    }

    if (interruptedIds.length > 0) {
      this.logger.info(`Reconciled ${interruptedIds.length} interrupted sessions.`);
    }

    return interruptedIds;
  }
}
