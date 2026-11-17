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
import { EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import {
  StructuredTaskPlan,
  TaskPlanStepStatus,
  validateTaskPlan,
} from "../../lib/ai-agent/plan-schema";
import {
  TaskStateMachine,
  TaskState,
  TaskStateTransitionRecord,
} from "../state-machine";
import {
  TaskExecutionEngine,
  VerificationEngine,
  VerificationReport,
} from "../planning";
import {
  SessionMetadataStore,
  RecoveryService,
  RecoveryReconciliationReport,
} from "../persistence";
import {
  KairoSessionMetadata,
  SessionSearchResult,
} from "../../lib/ai-agent/persistence-schema";

export interface ActiveSessionContext {
  sessionId: string;
  providerId: string;
  modelId: string;
  workspacePath: string;
  mode: "plan" | "act";
  startedAt: number;
  stateMachine?: TaskStateMachine;
  currentPlan?: StructuredTaskPlan;
  executionEngine?: TaskExecutionEngine;
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
  private readonly metadataStore: SessionMetadataStore;
  private readonly recoveryService: RecoveryService;
  private coreSubscriptionUnsubscribe: (() => void) | null = null;
  private eventSeq = 0;

  constructor(
    logger: Logger,
    runtimeManager: RuntimeManager,
    eventAdapter: EventAdapter,
    approvalCoordinator: ApprovalCoordinator,
    providerService?: ProviderService,
    contextService?: ContextService,
    metadataStore?: SessionMetadataStore,
    recoveryService?: RecoveryService
  ) {
    this.logger = logger.child("session-service");
    this.runtimeManager = runtimeManager;
    this.eventAdapter = eventAdapter;
    this.approvalCoordinator = approvalCoordinator;
    this.providerService = providerService;
    this.contextService = contextService;
    this.metadataStore =
      metadataStore ?? new SessionMetadataStore({ logger: this.logger });
    this.recoveryService =
      recoveryService ??
      new RecoveryService({
        metadataStore: this.metadataStore,
        runtimeManager: this.runtimeManager,
        logger: this.logger,
      });
  }

  public registerBroadcaster(broadcaster: SessionEventBroadcaster): () => void {
    this.globalSubscriptions.add(broadcaster);
    return () => {
      this.globalSubscriptions.delete(broadcaster);
    };
  }

  public broadcastCustomEvent(event: EventEnvelope): void {
    for (const broadcast of this.globalSubscriptions) {
      try {
        broadcast(event);
      } catch (err) {
        this.logger.error("Error in custom event broadcaster", err);
      }
    }
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
    const initialTaskState: TaskState = mode === "plan" ? "planning" : "idle";
    const stateMachine = new TaskStateMachine(sessionId, initialTaskState);
    const executionEngine = new TaskExecutionEngine({
      sessionId,
      workspaceRoot,
      stateMachine,
      logger: this.logger,
      onStepProgress: (payload) => {
        this.broadcastCustomEvent({
          type: "event",
          event: EVENT_NAMES.PLAN_STEP_PROGRESS,
          sessionId,
          seq: this.eventSeq++,
          timestamp: Date.now(),
          payload,
        });
      },
      onStateChange: (payload) => {
        this.broadcastCustomEvent({
          type: "event",
          event: EVENT_NAMES.TASK_STATE_CHANGED,
          sessionId,
          seq: this.eventSeq++,
          timestamp: Date.now(),
          payload,
        });
      },
    });

    this.activeSessions.set(sessionId, {
      sessionId,
      providerId: providerSettings.providerId,
      modelId: providerSettings.modelId,
      workspacePath: workspaceRoot,
      mode,
      startedAt: Date.now(),
      stateMachine,
      executionEngine,
    });

    // Persist initial Kairo session metadata atomically
    const initialMeta: KairoSessionMetadata = {
      version: 1,
      conversationId: sessionId,
      clineSessionId: sessionId,
      taskId: sessionId,
      workspaceId: "default",
      workspacePath: workspaceRoot,
      providerId: providerSettings.providerId,
      modelId: providerSettings.modelId,
      title: (params.prompt || "").slice(0, 60).trim() || "New Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
      status: "active",
      taskState: initialTaskState,
      mode,
      tags: [],
    };
    try {
      await this.metadataStore.saveMetadata(initialMeta);
    } catch (err) {
      this.logger.warn(`Failed to persist initial metadata for session ${sessionId}`, err);
    }

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
      if (
        targetMode === "plan" &&
        existing.stateMachine &&
        existing.stateMachine.getState() === "idle"
      ) {
        existing.stateMachine.transition("planning", "Switched to Plan Mode");
      }
    }

    // Update metadata last activity & status
    try {
      const meta = await this.metadataStore.getMetadata(params.sessionId);
      if (meta) {
        meta.lastActivityAt = Date.now();
        meta.updatedAt = Date.now();
        meta.status = "active";
        meta.mode = targetMode;
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata for session ${params.sessionId}`, err);
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
    try {
      const meta = await this.metadataStore.getMetadata(sessionId);
      if (meta) {
        meta.status = "idle";
        meta.updatedAt = Date.now();
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata on stopSession for ${sessionId}`, err);
    }
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    this.logger.info(`Deleting session: ${sessionId}`);
    this.activeSessions.delete(sessionId);
    await this.metadataStore.deleteMetadata(sessionId);

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
    const clineList = await cline.list(limit);

    // Enrich with Kairo metadata
    try {
      const kairoList = await this.metadataStore.listMetadata();
      const kairoMap = new Map<string, KairoSessionMetadata>();
      for (const m of kairoList) {
        kairoMap.set(m.clineSessionId, m);
      }

      for (const record of clineList) {
        const meta = kairoMap.get(record.sessionId);
        if (meta) {
          if (!record.metadata) record.metadata = {};
          if (meta.customTitle) {
            record.metadata.title = meta.customTitle;
          }
          (record.metadata as any).workspacePath = meta.workspacePath;
          (record.metadata as any).taskState = meta.taskState;
          (record.metadata as any).mode = meta.mode;
          (record.metadata as any).isInterrupted = meta.status === "interrupted";
          (record.metadata as any).hasPlan = !!meta.plan;
        }
      }
    } catch (err) {
      this.logger.warn("Failed to enrich session list with Kairo metadata", err);
    }

    return clineList;
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

  public async submitPlan(sessionId: string, rawPlan: unknown): Promise<StructuredTaskPlan> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const planVal = validateTaskPlan(rawPlan);
    if (!planVal.valid || !planVal.data) {
      throw new Error(`Invalid plan format: ${planVal.errors?.join(", ")}`);
    }
    const plan = planVal.data;
    session.currentPlan = plan;

    if (session.stateMachine) {
      if (session.stateMachine.canTransition("awaiting_plan_approval")) {
        session.stateMachine.transition(
          "awaiting_plan_approval",
          `Plan submitted: ${plan.objective}`
        );
      }
    }

    if (session.executionEngine) {
      session.executionEngine.loadPlan(plan);
    }

    try {
      const meta = await this.metadataStore.getMetadata(sessionId);
      if (meta) {
        meta.plan = plan;
        meta.taskState = "awaiting_plan_approval";
        meta.updatedAt = Date.now();
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata with plan for session ${sessionId}`, err);
    }

    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.PLAN_CREATED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, plan },
    });

    return plan;
  }

  public async approvePlan(
    sessionId: string,
    feedback?: string
  ): Promise<{ approved: boolean; sessionId: string }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }
    if (!session.currentPlan) {
      throw new Error(`No plan submitted for session '${sessionId}' to approve.`);
    }

    // Switch mode to "act"
    session.mode = "act";

    if (session.stateMachine) {
      if (session.stateMachine.canTransition("executing")) {
        session.stateMachine.transition(
          "executing",
          feedback ? `Plan approved with feedback: ${feedback}` : "Plan approved by user"
        );
      }
    }

    try {
      const meta = await this.metadataStore.getMetadata(sessionId);
      if (meta) {
        meta.mode = "act";
        meta.taskState = "executing";
        meta.updatedAt = Date.now();
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata on plan approval for session ${sessionId}`, err);
    }

    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.PLAN_APPROVED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, feedback },
    });

    return { approved: true, sessionId };
  }

  public async rejectPlan(
    sessionId: string,
    reason?: string,
    adjustOnly?: boolean
  ): Promise<{ rejected: boolean; adjustOnly: boolean }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (session.stateMachine) {
      if (adjustOnly) {
        if (session.stateMachine.canTransition("planning")) {
          session.stateMachine.transition(
            "planning",
            `User requested plan revisions: ${reason || "adjust plan"}`
          );
        }
      } else {
        if (session.stateMachine.canTransition("cancelled")) {
          session.stateMachine.transition(
            "cancelled",
            `Plan rejected by user: ${reason || "rejected"}`
          );
        }
      }
    }

    try {
      const meta = await this.metadataStore.getMetadata(sessionId);
      if (meta) {
        meta.taskState = adjustOnly ? "planning" : "cancelled";
        meta.status = adjustOnly ? "active" : "cancelled";
        meta.updatedAt = Date.now();
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata on rejectPlan for session ${sessionId}`, err);
    }

    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.PLAN_REJECTED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, reason, adjustOnly: !!adjustOnly },
    });

    return { rejected: true, adjustOnly: !!adjustOnly };
  }

  public getTaskState(sessionId: string): {
    sessionId: string;
    state: TaskState;
    plan?: StructuredTaskPlan;
    stepStatuses: Record<string, TaskPlanStepStatus>;
    history: TaskStateTransitionRecord[];
  } {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const state = session.stateMachine?.getState() || "idle";
    const history = session.stateMachine?.getHistory() || [];
    const stepStatuses = session.executionEngine?.getStepStatuses() || {};

    return {
      sessionId,
      state,
      plan: session.currentPlan,
      stepStatuses,
      history,
    };
  }

  public async verifyTask(
    sessionId: string,
    customTestCommands?: string[]
  ): Promise<VerificationReport> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }
    if (!session.currentPlan) {
      throw new Error(`No plan associated with session '${sessionId}' to verify.`);
    }

    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.VERIFICATION_STARTED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, planId: session.currentPlan.id },
    });

    if (session.stateMachine && session.stateMachine.canTransition("verifying")) {
      session.stateMachine.transition("verifying", "Verification in progress");
    }

    const verificationEngine =
      session.executionEngine?.getVerificationEngine() ??
      new VerificationEngine({ logger: this.logger });

    const report = await verificationEngine.verifyPlan({
      plan: session.currentPlan,
      workspaceRoot: session.workspacePath,
      customCommands: customTestCommands,
    });

    if (session.stateMachine) {
      if (report.passed) {
        if (session.stateMachine.canTransition("completed")) {
          session.stateMachine.transition("completed", report.summary);
        }
      } else {
        if (session.stateMachine.canTransition("failed")) {
          session.stateMachine.transition("failed", report.summary);
        }
      }
    }

    try {
      const meta = await this.metadataStore.getMetadata(sessionId);
      if (meta) {
        meta.taskState = report.passed ? "completed" : "failed";
        meta.status = report.passed ? "completed" : "failed";
        meta.updatedAt = Date.now();
        await this.metadataStore.saveMetadata(meta);
      }
    } catch (err) {
      this.logger.warn(`Failed to update metadata on verification for session ${sessionId}`, err);
    }

    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.VERIFICATION_COMPLETED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, report },
    });

    return report;
  }

  public getMetadataStore(): SessionMetadataStore {
    return this.metadataStore;
  }

  public getRecoveryService(): RecoveryService {
    return this.recoveryService;
  }

  public async renameSession(
    sessionId: string,
    newTitle: string
  ): Promise<{ sessionId: string; title: string }> {
    this.logger.info(`Renaming session ${sessionId} to: "${newTitle}"`);

    // 1. Update Cline canonical session metadata if supported
    if (this.runtimeManager.isReady()) {
      try {
        const cline = this.runtimeManager.getInstance();
        if (typeof cline.update === "function") {
          await cline.update(sessionId, { title: newTitle });
        }
      } catch (err) {
        this.logger.warn(`Failed to update title in Cline core for ${sessionId}`, err);
      }
    }

    // 2. Update Kairo session metadata store
    await this.metadataStore.renameMetadata(sessionId, newTitle);

    // 3. Broadcast rename event
    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.SESSION_RENAMED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, title: newTitle },
    });

    return { sessionId, title: newTitle };
  }

  public async restoreSession(
    sessionId: string,
    targetWorkspacePath?: string
  ): Promise<{
    sessionId: string;
    restored: boolean;
    metadata: KairoSessionMetadata;
    messages: SessionDisplayMessage[];
    workspaceWarning?: string;
  }> {
    this.logger.info(`Restoring session ${sessionId}...`);

    // 1. Read messages from Cline canonical source of truth
    const messages = await this.readMessages(sessionId);

    // 2. Fetch Kairo metadata (or build fallback if missing)
    let meta = await this.metadataStore.getMetadata(sessionId);
    if (!meta) {
      meta = {
        version: 1,
        conversationId: sessionId,
        clineSessionId: sessionId,
        taskId: sessionId,
        workspaceId: "default",
        workspacePath: targetWorkspacePath || process.cwd(),
        providerId: "unknown",
        modelId: "unknown",
        title: "Restored Session",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivityAt: Date.now(),
        status: "idle",
        taskState: "idle",
        mode: "act",
        tags: [],
      };
      await this.metadataStore.saveMetadata(meta);
    }

    // 3. Check workspace association if target workspace provided
    let workspaceWarning: string | undefined;
    if (targetWorkspacePath && meta.workspacePath) {
      const validation = this.recoveryService.validateWorkspaceAssociation(
        meta.workspacePath,
        targetWorkspacePath
      );
      if (!validation.matches) {
        workspaceWarning = validation.warning;
      }
    }

    // 4. Rehydrate in-memory session context
    const effectiveWorkspace = targetWorkspacePath || meta.workspacePath || process.cwd();
    const stateMachine = new TaskStateMachine(sessionId, meta.taskState ?? "idle");
    const executionEngine = new TaskExecutionEngine({
      sessionId,
      workspaceRoot: effectiveWorkspace,
      stateMachine,
      logger: this.logger,
      onStepProgress: (payload) => {
        this.broadcastCustomEvent({
          type: "event",
          event: EVENT_NAMES.PLAN_STEP_PROGRESS,
          sessionId,
          seq: this.eventSeq++,
          timestamp: Date.now(),
          payload,
        });
      },
      onStateChange: (payload) => {
        this.broadcastCustomEvent({
          type: "event",
          event: EVENT_NAMES.TASK_STATE_CHANGED,
          sessionId,
          seq: this.eventSeq++,
          timestamp: Date.now(),
          payload,
        });
      },
    });

    if (meta.plan) {
      try {
        executionEngine.loadPlan(meta.plan);
      } catch (err) {
        this.logger.warn(`Failed to set stored plan on restore for ${sessionId}`, err);
      }
    }

    this.activeSessions.set(sessionId, {
      sessionId,
      providerId: meta.providerId,
      modelId: meta.modelId,
      workspacePath: effectiveWorkspace,
      mode: meta.mode ?? "act",
      startedAt: meta.createdAt,
      stateMachine,
      currentPlan: meta.plan,
      executionEngine,
    });

    // 5. Broadcast restore event
    this.broadcastCustomEvent({
      type: "event",
      event: EVENT_NAMES.SESSION_RESTORED,
      sessionId,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      payload: { sessionId, metadata: meta, workspaceWarning },
    });

    return {
      sessionId,
      restored: true,
      metadata: meta,
      messages,
      workspaceWarning,
    };
  }

  public async searchSessions(
    query: string,
    limit: number = 50
  ): Promise<SessionSearchResult[]> {
    const matched = await this.metadataStore.searchMetadata(query, limit);
    const q = query.toLowerCase();

    return matched.map((meta) => {
      let matchField: SessionSearchResult["matchField"] = "title";
      let snippet = meta.customTitle || meta.title;

      if (meta.plan) {
        if (meta.plan.objective.toLowerCase().includes(q)) {
          matchField = "plan_objective";
          snippet = meta.plan.objective;
        } else if (meta.plan.understanding.toLowerCase().includes(q)) {
          matchField = "plan_understanding";
          snippet = meta.plan.understanding;
        } else if (meta.plan.relevantFiles.some((f) => f.toLowerCase().includes(q))) {
          matchField = "file_path";
          snippet = meta.plan.relevantFiles.find((f) => f.toLowerCase().includes(q)) || "";
        }
      }

      return {
        sessionId: meta.clineSessionId,
        conversationId: meta.conversationId,
        title: meta.customTitle || meta.title,
        snippet,
        matchField,
        workspacePath: meta.workspacePath,
        lastActivityAt: meta.lastActivityAt,
        status: meta.status,
      };
    });
  }

  public async reconcileStartupState(
    currentWorkspaceRoot?: string
  ): Promise<RecoveryReconciliationReport> {
    return await this.recoveryService.reconcileStartupState(currentWorkspaceRoot);
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
