/**
 * Session Recovery & Reconciliation Service.
 *
 * Reconciles session status after application/sidecar restart, verifies workspace
 * associations, cross-references with Cline Core canonical storage, and ensures
 * interrupted operations and pending approvals are never automatically executed.
 */
import * as path from "node:path";
import { Logger } from "../utils/logger";
import { SessionMetadataStore } from "./session-metadata-store";
import { KairoSessionMetadata } from "../../lib/ai-agent/persistence-schema";
import { RuntimeManager } from "../runtime/manager";
import type { SessionHistoryRecord } from "@cline/core";

export interface WorkspaceValidationResult {
  matches: boolean;
  sessionWorkspace: string;
  currentWorkspace: string;
  warning?: string;
}

export interface RecoveryReconciliationReport {
  interruptedCount: number;
  interruptedSessionIds: string[];
  orphanedMetadataCleaned: number;
  stubsCreatedForClineSessions: number;
}

export interface RecoveryServiceOptions {
  metadataStore: SessionMetadataStore;
  runtimeManager?: RuntimeManager;
  logger?: Logger;
}

export class RecoveryService {
  private readonly metadataStore: SessionMetadataStore;
  private readonly runtimeManager?: RuntimeManager;
  private readonly logger: Logger;

  constructor(options: RecoveryServiceOptions) {
    this.metadataStore = options.metadataStore;
    this.runtimeManager = options.runtimeManager;
    this.logger = options.logger
      ? options.logger.child("recovery-service")
      : new Logger("recovery-service");
  }

  public getMetadataStore(): SessionMetadataStore {
    return this.metadataStore;
  }

  /**
   * Normalize workspace path for cross-platform comparison.
   */
  public static normalizeWorkspacePath(rawPath: string): string {
    const resolved = path.resolve(rawPath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  /**
   * Validate whether a session's recorded workspace matches the current Kairo workspace.
   */
  public validateWorkspaceAssociation(
    sessionWorkspace: string,
    currentWorkspace: string
  ): WorkspaceValidationResult {
    const normSession = RecoveryService.normalizeWorkspacePath(sessionWorkspace);
    const normCurrent = RecoveryService.normalizeWorkspacePath(currentWorkspace);
    const matches = normSession === normCurrent;

    return {
      matches,
      sessionWorkspace,
      currentWorkspace,
      warning: matches
        ? undefined
        : `Session belongs to workspace '${sessionWorkspace}', but current workspace is '${currentWorkspace}'. File tools and terminal commands should be verified before execution.`,
    };
  }

  /**
   * Reconcile session state upon server boot / application restart.
   *
   * 1. Reconciles interrupted tasks.
   * 2. Cross-references Cline Core canonical storage with Kairo metadata store.
   * 3. Guarantees zero automatic re-execution of pending tools.
   */
  public async reconcileStartupState(currentWorkspaceRoot?: string): Promise<RecoveryReconciliationReport> {
    this.logger.info("Starting restart reconciliation across session stores...");

    // 1. Reconcile interrupted tasks
    const interruptedSessionIds = await this.metadataStore.reconcileInterruptedSessions();

    let orphanedMetadataCleaned = 0;
    let stubsCreatedForClineSessions = 0;

    // 2. Cross-reference with Cline Core if available
    if (this.runtimeManager && this.runtimeManager.isReady()) {
      try {
        const cline = this.runtimeManager.getInstance();
        const clineSessions = await cline.list(500);
        const clineSessionMap = new Map<string, SessionHistoryRecord>();
        for (const s of clineSessions) {
          clineSessionMap.set(s.sessionId, s);
        }

        const kairoMetadataList = await this.metadataStore.listMetadata();
        const kairoMetadataMap = new Map<string, KairoSessionMetadata>();
        for (const m of kairoMetadataList) {
          kairoMetadataMap.set(m.clineSessionId, m);
        }

        // Detect sessions in Cline Core that lack Kairo metadata
        for (const [id, clineRec] of clineSessionMap.entries()) {
          if (!kairoMetadataMap.has(id)) {
            const workspacePath =
              (clineRec as any).workspaceRoot ||
              (clineRec as any).cwd ||
              currentWorkspaceRoot ||
              process.cwd();

            const title =
              clineRec.metadata?.title ||
              `Recovered Session ${id.slice(0, 8)}`;

            const stub: KairoSessionMetadata = {
              version: 1,
              conversationId: id,
              clineSessionId: id,
              taskId: id,
              workspaceId: "default",
              workspacePath,
              providerId: (clineRec as any).provider || "anthropic",
              modelId: (clineRec as any).model || "claude-3-7-sonnet-20250219",
              title,
              createdAt: clineRec.startedAt ? new Date(clineRec.startedAt).getTime() : Date.now(),
              updatedAt: clineRec.endedAt ? new Date(clineRec.endedAt).getTime() : Date.now(),
              lastActivityAt: clineRec.endedAt ? new Date(clineRec.endedAt).getTime() : Date.now(),
              status: (clineRec.status as any) || "idle",
              taskState: "idle",
              mode: "act",
              tags: ["recovered_from_core"],
            };

            await this.metadataStore.saveMetadata(stub);
            stubsCreatedForClineSessions++;
          }
        }
      } catch (err) {
        this.logger.warn("Could not cross-reference with Cline Core during startup", err);
      }
    }

    const report: RecoveryReconciliationReport = {
      interruptedCount: interruptedSessionIds.length,
      interruptedSessionIds,
      orphanedMetadataCleaned,
      stubsCreatedForClineSessions,
    };

    this.logger.info("Restart reconciliation completed successfully", report);
    return report;
  }
}
