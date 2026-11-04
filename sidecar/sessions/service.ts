import type { CoreSessionEvent, SessionDisplayMessage } from "@cline/sdk";
import type { SessionHistoryRecord, SessionUsageSummary } from "@cline/core";
import { Logger } from "../utils/logger";
import { RuntimeManager } from "../runtime/manager";
import { EventAdapter } from "../runtime/event-adapter";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { SessionContextProvider } from "../permissions/permission-manager";
import { ProviderManager } from "../providers";
import { ProviderService } from "../providers/service";
import { ContextService } from "../context/context-service";
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
  mode: "plan" | "act";
  startedAt: number;
}

export type SessionEventBroadcaster = (event: EventEnvelope) => void;

export class SessionService implements SessionContextProvider {
  private readonly runtimeManager: RuntimeManager;
  private readonly eventAdapter: EventAdapter;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly providerService?: ProviderService;
  private readonly contextService?: ContextService;
  private readonly logger: Logger;
  private readonly activeSessions = new Map<string, ActiveSessionContext>();
  private readonly globalSubscriptions = new Set<SessionEventBroadcaster>();
  private coreSubscriptionUnsubscribe: (() => void) | null = null;

  constructor(
    logger: Logger,
    runtimeManager: RuntimeManager,
    eventAdapter: EventAdapter,
    approvalCoordinator: ApprovalCoordinator,
    providerService?: ProviderService,
    contextService?: ContextService
  ) {
    this.logger = logger.child("session-service");
    this.runtimeManager = runtimeManager;
    this.eventAdapter = eventAdapter;
    this.approvalCoordinator = approvalCoordinator;
    this.providerService = providerService;
    this.contextService = contextService;
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

    let providerId = params.providerId;
    let modelId = params.modelId;
    let apiKey = params.apiKey;
    let baseUrl = params.baseUrl;

    if (this.providerService) {
      if (!apiKey && providerId) {
        const creds = await this.providerService.getVault().getCredentials(providerId);
        apiKey = creds?.apiKey;
        if (!baseUrl) {
          const stored = await this.providerService.getSettingsStore().getProvider(providerId);
          baseUrl = stored?.baseUrl;
          if (!modelId) {
            modelId = stored?.modelId;
          }
        }
      } else if (!providerId) {
        const activeConfig = await this.providerService.resolveActiveProviderConfig().catch(() => null);
        if (activeConfig) {
          providerId = activeConfig.providerId;
          modelId = activeConfig.modelId;
          apiKey = activeConfig.apiKey;
          baseUrl = activeConfig.baseUrl;
        }
      }
    }

    const providerSettings = ProviderManager.resolveSettings({
      providerId,
      modelId,
      apiKey,
      baseUrl,
    });

    const workspaceRoot = params.workspacePath || process.cwd();
    const mode = (params.mode as "plan" | "act") || "act";
    const systemPrompt =
      "You are Kairo AI Agent, an autonomous software engineering assistant running inside Kairo IDE.";

    let finalPrompt = params.prompt;
    const contextSvc = this.contextService ?? new ContextService(workspaceRoot);
    if (params.context || params.prompt.includes("@")) {
      try {
        const assembled = await contextSvc.resolveContext({
          workspaceRoot,
          prompt: params.prompt,
          context: params.context,
        });
        if (assembled.formattedPrompt) {
          finalPrompt = `${assembled.formattedPrompt}\n\n# User Request\n${params.prompt}`;
        }
      } catch (err) {
        this.logger.warn("Failed to resolve workspace context for session start", err);
      }
    }

    this.logger.info(
      `Starting agent session with provider=${providerSettings.providerId}, model=${providerSettings.modelId}, workspace=${workspaceRoot}, mode=${mode}`
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
      prompt: finalPrompt,
    });

    const sessionId = startResult.sessionId;
    this.activeSessions.set(sessionId, {
      sessionId,
      providerId: providerSettings.providerId,
      modelId: providerSettings.modelId,
      workspacePath: workspaceRoot,
      mode,
      startedAt: Date.now(),
    });

    this.logger.info(`Session created successfully: ${sessionId}`);
    return sessionId;
  }

  public async sendMessage(params: SendMessageParams): Promise<void> {
    const cline = this.runtimeManager.getInstance();
    this.ensureCoreEventSubscription();

    const targetMode = (params.mode as "plan" | "act") || "act";
    const existing = this.activeSessions.get(params.sessionId);
    if (existing) {
      existing.mode = targetMode;
    }

    const workspaceRoot = existing?.workspacePath || process.cwd();
    let finalPrompt = params.prompt;
    const contextSvc = this.contextService ?? new ContextService(workspaceRoot);
    if (params.context || params.prompt.includes("@")) {
      try {
        const assembled = await contextSvc.resolveContext({
          workspaceRoot,
          prompt: params.prompt,
          context: params.context,
        });
        if (assembled.formattedPrompt) {
          finalPrompt = `${assembled.formattedPrompt}\n\n# User Request\n${params.prompt}`;
        }
      } catch (err) {
        this.logger.warn("Failed to resolve workspace context for send_message", err);
      }
    }

    this.logger.info(`Sending message to session: ${params.sessionId} (mode: ${targetMode})`);
    await cline.send({
      sessionId: params.sessionId,
      prompt: finalPrompt,
      mode: targetMode,
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

  public async loadSession(sessionId: string): Promise<{
    sessionId: string;
    messages: SessionDisplayMessage[];
    usage?: SessionUsageSummary;
  } | null> {
    const messages = await this.readMessages(sessionId);
    const usage = await this.getUsage(sessionId);
    return {
      sessionId,
      messages,
      usage,
    };
  }

  public async getUsage(sessionId: string): Promise<SessionUsageSummary | undefined> {
    if (!this.runtimeManager.isReady()) return undefined;
    const cline = this.runtimeManager.getInstance();
    return await cline.getAccumulatedUsage(sessionId);
  }

  public getSessionWorkspace(sessionId: string): string | undefined {
    return this.activeSessions.get(sessionId)?.workspacePath;
  }

  public getSessionMode(sessionId: string): "plan" | "act" {
    return this.activeSessions.get(sessionId)?.mode || "act";
  }

  public getActiveSession(sessionId: string): ActiveSessionContext | undefined {
    return this.activeSessions.get(sessionId);
  }

  public getAllActiveSessions(): ActiveSessionContext[] {
    return Array.from(this.activeSessions.values());
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
