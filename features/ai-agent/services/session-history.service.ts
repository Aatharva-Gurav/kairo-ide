/**
 * Frontend Session History Service.
 *
 * Coordinates conversation and session persistence, history listing, session restoration,
 * conversation renaming, session search, and restart recovery status on the client.
 */
import { DesktopTransport } from "./desktop-transport";
import {
  KairoSessionMetadata,
  SessionSearchResult,
} from "@/lib/ai-agent/persistence-schema";
import { COMMAND_NAMES, EVENT_NAMES } from "@/lib/ai-agent/protocol-constants";

export interface EnrichedSessionRecord {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  taskState?: string;
  mode?: "plan" | "act";
  isInterrupted?: boolean;
  hasPlan?: boolean;
  messageCount?: number;
}

export interface RestoredSessionResult {
  sessionId: string;
  restored: boolean;
  metadata: KairoSessionMetadata;
  messages: unknown[];
  workspaceWarning?: string;
}

export interface ReconcileResult {
  reconciledCount: number;
  interruptedSessionIds: string[];
}

export type SessionHistoryListener = (sessions: EnrichedSessionRecord[]) => void;

export class SessionHistoryService {
  private readonly transport: DesktopTransport;
  private currentSessions: EnrichedSessionRecord[] = [];
  private activeSessionId: string | null = null;
  private readonly listeners = new Set<SessionHistoryListener>();
  private readonly eventUnsubscribes: Array<() => void> = [];

  constructor(transport: DesktopTransport) {
    this.transport = transport;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const onSessionRestored = (payload: unknown) => {
      const p = payload as {
        sessionId: string;
        metadata?: KairoSessionMetadata;
      };
      if (p?.sessionId) {
        this.activeSessionId = p.sessionId;
        const existing = this.currentSessions.find((s) => s.sessionId === p.sessionId);
        if (existing && p.metadata) {
          existing.title = p.metadata.customTitle || p.metadata.title;
          existing.taskState = p.metadata.taskState;
          existing.mode = p.metadata.mode;
          existing.isInterrupted = p.metadata.status === "interrupted";
          existing.hasPlan = !!p.metadata.plan;
          existing.updatedAt = p.metadata.updatedAt;
          this.notifyListeners();
        }
      }
    };

    const onSessionRenamed = (payload: unknown) => {
      const p = payload as { sessionId: string; title: string };
      if (p?.sessionId && p?.title) {
        const item = this.currentSessions.find((s) => s.sessionId === p.sessionId);
        if (item) {
          item.title = p.title;
          item.updatedAt = Date.now();
          this.notifyListeners();
        }
      }
    };

    const onSessionInterrupted = (payload: unknown) => {
      const p = payload as { sessionId: string };
      if (p?.sessionId) {
        const item = this.currentSessions.find((s) => s.sessionId === p.sessionId);
        if (item) {
          item.isInterrupted = true;
          item.taskState = "interrupted";
          this.notifyListeners();
        }
      }
    };

    this.eventUnsubscribes.push(
      this.transport.on(EVENT_NAMES.SESSION_RESTORED, onSessionRestored),
      this.transport.on(EVENT_NAMES.SESSION_RENAMED, onSessionRenamed),
      this.transport.on(EVENT_NAMES.SESSION_INTERRUPTED, onSessionInterrupted)
    );
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  public getCachedSessions(): EnrichedSessionRecord[] {
    return [...this.currentSessions];
  }

  public onSessionsChange(listener: SessionHistoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = [...this.currentSessions];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn("[SessionHistoryService] Listener threw an error", err);
      }
    }
  }

  /**
   * List recent sessions from canonical storage, enriched with Kairo metadata.
   */
  public async listSessions(limit: number = 50): Promise<EnrichedSessionRecord[]> {
    const res = await this.transport.sendCommand<{
      sessions: Array<{
        sessionId: string;
        createdAt?: number;
        updatedAt?: number;
        messageCount?: number;
        metadata?: {
          title?: string;
          workspacePath?: string;
          taskState?: string;
          mode?: "plan" | "act";
          isInterrupted?: boolean;
          hasPlan?: boolean;
        };
      }>;
    }>(COMMAND_NAMES.LIST_SESSIONS, { limit });

    const records: EnrichedSessionRecord[] = (res?.sessions || []).map((s) => ({
      sessionId: s.sessionId,
      title: s.metadata?.title || `Session ${s.sessionId.slice(0, 8)}`,
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
      workspacePath: s.metadata?.workspacePath,
      taskState: s.metadata?.taskState,
      mode: s.metadata?.mode,
      isInterrupted: s.metadata?.isInterrupted ?? false,
      hasPlan: s.metadata?.hasPlan ?? false,
      messageCount: s.messageCount,
    }));

    this.currentSessions = records;
    this.notifyListeners();
    return records;
  }

  /**
   * Load display messages and usage for a specific session.
   */
  public async loadSession(sessionId: string): Promise<{
    sessionId: string;
    messages: unknown[];
    usage?: unknown;
  } | null> {
    const res = await this.transport.sendCommand<{
      session: {
        sessionId: string;
        messages: unknown[];
        usage?: unknown;
      };
    }>(COMMAND_NAMES.LOAD_SESSION, { sessionId });

    if (res?.session) {
      this.activeSessionId = res.session.sessionId;
      return res.session;
    }
    return null;
  }

  /**
   * Restore an interrupted or past session and rehydrate execution engine.
   */
  public async restoreSession(
    sessionId: string,
    workspacePath?: string
  ): Promise<RestoredSessionResult> {
    const res = await this.transport.sendCommand<RestoredSessionResult>(
      COMMAND_NAMES.RESTORE_SESSION,
      { sessionId, workspacePath }
    );

    this.activeSessionId = res.sessionId;
    const item = this.currentSessions.find((s) => s.sessionId === res.sessionId);
    if (item && res.metadata) {
      item.title = res.metadata.customTitle || res.metadata.title;
      item.taskState = res.metadata.taskState;
      item.mode = res.metadata.mode;
      item.isInterrupted = res.metadata.status === "interrupted";
      item.hasPlan = !!res.metadata.plan;
      item.updatedAt = res.metadata.updatedAt;
      this.notifyListeners();
    }

    return res;
  }

  /**
   * Rename a conversation title.
   */
  public async renameSession(
    sessionId: string,
    title: string
  ): Promise<{ sessionId: string; title: string }> {
    const res = await this.transport.sendCommand<{
      sessionId: string;
      title: string;
    }>(COMMAND_NAMES.RENAME_SESSION, { sessionId, title });

    const item = this.currentSessions.find((s) => s.sessionId === sessionId);
    if (item) {
      item.title = res.title;
      item.updatedAt = Date.now();
      this.notifyListeners();
    }

    return res;
  }

  /**
   * Delete a session permanently.
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    const res = await this.transport.sendCommand<{ deleted: boolean }>(
      COMMAND_NAMES.DELETE_SESSION,
      { sessionId }
    );

    if (res?.deleted) {
      this.currentSessions = this.currentSessions.filter((s) => s.sessionId !== sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
      }
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Search session history by query.
   */
  public async searchSessions(
    query: string,
    limit?: number
  ): Promise<SessionSearchResult[]> {
    const res = await this.transport.sendCommand<{
      results: SessionSearchResult[];
    }>(COMMAND_NAMES.SEARCH_SESSIONS, { query, limit });

    return res?.results || [];
  }

  /**
   * Request startup reconciliation across session stores.
   */
  public async reconcileStartupState(dryRun?: boolean): Promise<ReconcileResult> {
    const res = await this.transport.sendCommand<ReconcileResult>(
      COMMAND_NAMES.RECONCILE_SESSIONS,
      { dryRun }
    );

    return res;
  }

  public dispose(): void {
    for (const unsub of this.eventUnsubscribes) {
      unsub();
    }
    this.eventUnsubscribes.length = 0;
    this.listeners.clear();
  }
}
