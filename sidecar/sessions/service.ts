import type { CoreSessionEvent, SessionDisplayMessage } from "@cline/sdk";
import type { SessionHistoryRecord, SessionUsageSummary } from "@cline/core";
import { Logger } from "../utils/logger";
import { RuntimeManager } from "../runtime/manager";
import { EventAdapter } from "../runtime/event-adapter";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { ProviderManager } from "../providers";
import {
  StartTaskParams,
  SendMessageParams,
  EventEnvelope,
} from "../../lib/ai-agent/types";

export interface ActiveSessionContext {
  sessionId: string;
  providerId: string;
  modelId: string;
  workspacePath: string;
  startedAt: number;
}

export type SessionEventBroadcaster = (event: EventEnvelope) => void;

export class SessionService {
  private readonly runtimeManager: RuntimeManager;
  private readonly eventAdapter: EventAdapter;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly logger: Logger;
  private readonly activeSessions = new Map<string, ActiveSessionContext>();
  private readonly globalSubscriptions = new Set<SessionEventBroadcaster>();
  private coreSubscriptionUnsubscribe: (() => void) | null = null;

  constructor(
    logger: Logger,
    runtimeManager: RuntimeManager,
    eventAdapter: EventAdapter,
    approvalCoordinator: ApprovalCoordinator
  ) {
    this.logger = logger.child("session-service");
    this.runtimeManager = runtimeManager;
    this.eventAdapter = eventAdapter;
    this.approvalCoordinator = approvalCoordinator;
  }

  public registerBroadcaster(broadcaster: SessionEventBroadcaster): () => void {
    this.globalSubscriptions.add(broadcaster);
    return () => {
      this.globalSubscriptions.delete(broadcaster);
    };
  }

  private ensureCoreEventSubscription(): void {
    if (this.coreSubscriptionUnsubscribe) return;

    const cline = this.runtimeManager.getInstance();
    this.coreSubscriptionUnsubscribe = cline.subscribe((coreEvent: CoreSessionEvent) => {
      try {
        const envelope = this.eventAdapter.transform(coreEvent);
        if (envelope) {
          for (const broadcast of this.globalSubscriptions) {
            broadcast(envelope);
          }
        }
      } catch (err) {
        this.logger.error("Error transforming or broadcasting core event", err);
      }
    });
  }

  public async createSession(
    params: StartTaskParams,
    broadcaster?: SessionEventBroadcaster
  ): Promise<string> {
    const cline = await this.runtimeManager.initialize();
    this.ensureCoreEventSubscription();

    if (broadcaster) {
      this.registerBroadcaster(broadcaster);
    }

    const providerSettings = ProviderManager.resolveSettings(params);
    const workspaceRoot = params.workspacePath || process.cwd();
    const systemPrompt =
      "You are Kairo AI Agent, an autonomous software engineering assistant running inside Kairo IDE.";

    this.logger.info(
      `Starting agent session with provider=${providerSettings.providerId}, model=${providerSettings.modelId}, workspace=${workspaceRoot}`
    );

    const startResult = await cline.start({
      config: {
        providerId: providerSettings.providerId,
        modelId: providerSettings.modelId,
        apiKey: providerSettings.apiKey,
        baseUrl: providerSettings.baseUrl,
        systemPrompt,
        cwd: workspaceRoot,
        workspaceRoot,
        enableTools: true,
        enableSpawnAgent: false,
        enableAgentTeams: false,
      },
      prompt: params.prompt,
    });

    const sessionId = startResult.sessionId;
    this.activeSessions.set(sessionId, {
      sessionId,
      providerId: providerSettings.providerId,
      modelId: providerSettings.modelId,
      workspacePath: workspaceRoot,
      startedAt: Date.now(),
    });

    this.logger.info(`Session created successfully: ${sessionId}`);
    return sessionId;
  }

  public async sendMessage(params: SendMessageParams): Promise<void> {
    const cline = this.runtimeManager.getInstance();
    this.ensureCoreEventSubscription();

    this.logger.info(`Sending message to session: ${params.sessionId}`);
    await cline.send({
      sessionId: params.sessionId,
      prompt: params.prompt,
      mode: params.mode ?? "act",
    });
  }

  public async abortSession(sessionId: string, reason?: string): Promise<void> {
    this.logger.info(`Aborting session ${sessionId}${reason ? ` (${reason})` : ""}`);
    this.approvalCoordinator.abortForSession(sessionId, reason || "Aborted by user");

    if (this.runtimeManager.isReady()) {
      const cline = this.runtimeManager.getInstance();
      await cline.abort(sessionId, reason);
    }
  }

  public async stopSession(sessionId: string): Promise<void> {
    this.logger.info(`Stopping session: ${sessionId}`);
    this.approvalCoordinator.abortForSession(sessionId, "Session stopped");

    if (this.runtimeManager.isReady()) {
      const cline = this.runtimeManager.getInstance();
      await cline.stop(sessionId);
    }
    this.activeSessions.delete(sessionId);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    this.logger.info(`Deleting session: ${sessionId}`);
    this.activeSessions.delete(sessionId);

    if (this.runtimeManager.isReady()) {
      const cline = this.runtimeManager.getInstance();
      return await cline.delete(sessionId);
    }
    return false;
  }

  public async readMessages(sessionId: string): Promise<SessionDisplayMessage[]> {
    const cline = await this.runtimeManager.initialize();
    return await cline.readDisplayMessages(sessionId);
  }

  public async listSessions(limit: number = 50): Promise<SessionHistoryRecord[]> {
    const cline = await this.runtimeManager.initialize();
    return await cline.list(limit);
  }

  public async getUsage(sessionId: string): Promise<SessionUsageSummary | undefined> {
    if (!this.runtimeManager.isReady()) return undefined;
    const cline = this.runtimeManager.getInstance();
    return await cline.getAccumulatedUsage(sessionId);
  }

  public getActiveCount(): number {
    return this.activeSessions.size;
  }

  public dispose(): void {
    if (this.coreSubscriptionUnsubscribe) {
      this.coreSubscriptionUnsubscribe();
      this.coreSubscriptionUnsubscribe = null;
    }
    this.globalSubscriptions.clear();
    this.activeSessions.clear();
  }
}
