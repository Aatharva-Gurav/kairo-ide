import type { ServerWebSocket } from "bun";
import { Logger } from "../utils/logger";
import {
  CommandEnvelopeSchema,
  HandshakeParamsSchema,
  StartTaskParamsSchema,
  SendMessageParamsSchema,
  CancelTaskParamsSchema,
  StopTaskParamsSchema,
  RespondToolApprovalParamsSchema,
  ListSessionsParamsSchema,
  LoadSessionParamsSchema,
  DeleteSessionParamsSchema,
  ConfigureProviderParamsSchema,
  GetProviderParamsSchema,
  DeleteProviderParamsSchema,
  SetActiveProviderParamsSchema,
  ListProviderModelsParamsSchema,
  ValidateProviderCredentialsParamsSchema,
  TestProviderConnectivityParamsSchema,
  ResolveWorkspaceContextParamsSchema,
} from "../../lib/ai-agent/transport-schema";
import type {
  ResponseEnvelope,
  EventEnvelope,
  HandshakeResult,
} from "../../lib/ai-agent/types";
import {
  PROTOCOL_VERSION,
  ERROR_CODES,
  EVENT_NAMES,
  HEARTBEAT_PING_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
} from "../../lib/ai-agent/protocol-constants";
import { SessionService } from "../sessions";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PermissionManager } from "../permissions/permission-manager";
import { RuntimeManager } from "../runtime/manager";
import { AgentErrorHandler } from "../runtime/error-handler";
import { ProviderService } from "../providers/service";
import { VERIFIED_PROVIDER_IDS } from "../providers/registry";
import { ContextService } from "../context/context-service";

export interface SocketData {
  id: string;
  connectedAt: number;
  lastPingAt: number;
  isAlive: boolean;
  authenticated: boolean;
}

export interface ConnectionManagerOptions {
  sessionService?: SessionService;
  approvalCoordinator?: ApprovalCoordinator;
  runtimeManager?: RuntimeManager;
  providerService?: ProviderService;
  permissionManager?: PermissionManager;
  contextService?: ContextService;
}

export class ConnectionManager {
  private readonly sockets = new Set<ServerWebSocket<SocketData>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;
  private readonly sessionService?: SessionService;
  private readonly approvalCoordinator?: ApprovalCoordinator;
  private readonly runtimeManager?: RuntimeManager;
  private readonly providerService?: ProviderService;
  private readonly permissionManager?: PermissionManager;
  private readonly contextService?: ContextService;
  private eventSeq = 0;

  constructor(logger: Logger, options: ConnectionManagerOptions = {}) {
    this.logger = logger.child("connection-manager");
    this.sessionService = options.sessionService;
    this.approvalCoordinator = options.approvalCoordinator;
    this.runtimeManager = options.runtimeManager;
    this.providerService = options.providerService;
    this.permissionManager = options.permissionManager;
    this.contextService = options.contextService;

    if (this.sessionService) {
      this.sessionService.registerBroadcaster((event) => {
        this.broadcastEvent(event);
      });
    }

    if (this.approvalCoordinator) {
      this.approvalCoordinator.setNotifier((approval) => {
        this.broadcastEvent({
          type: "event",
          event: EVENT_NAMES.TOOL_APPROVAL_REQUEST,
          sessionId: approval.sessionId,
          seq: this.eventSeq++,
          timestamp: Date.now(),
          payload: approval,
        });
      });
    }
  }

  public register(ws: ServerWebSocket<SocketData>): void {
    this.sockets.add(ws);
    this.logger.info(`Client connected: socket id ${ws.data.id}`);

    if (!this.heartbeatTimer) {
      this.startHeartbeat();
    }
  }

  public unregister(ws: ServerWebSocket<SocketData>): void {
    this.sockets.delete(ws);
    this.logger.info(`Client disconnected: socket id ${ws.data.id}`);

    if (this.sockets.size === 0 && this.heartbeatTimer) {
      this.stopHeartbeat();
    }
  }

  public getActiveCount(): number {
    return this.sockets.size;
  }

  public sendResponse(
    ws: ServerWebSocket<SocketData>,
    response: ResponseEnvelope
  ): void {
    try {
      ws.send(JSON.stringify(response));
    } catch (err) {
      this.logger.error(`Failed to send response to socket ${ws.data.id}`, err);
    }
  }

  public broadcastEvent(event: EventEnvelope): void {
    const payload = JSON.stringify(event);
    for (const ws of this.sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        this.logger.warn(`Failed to broadcast event to socket ${ws.data.id}`, err);
      }
    }
  }

  public closeAll(): void {
    this.stopHeartbeat();
    for (const ws of this.sockets) {
      try {
        ws.close(1001, "Server shutting down");
      } catch {
        // ignore
      }
    }
    this.sockets.clear();
  }

  public async handleMessage(
    ws: ServerWebSocket<SocketData>,
    message: string | Buffer
  ): Promise<void> {
    const payloadLength = typeof message === "string" ? message.length : message.byteLength;
    if (payloadLength > MAX_PAYLOAD_BYTES) {
      this.sendResponse(ws, {
        type: "response",
        id: "unknown",
        status: "error",
        error: {
          code: ERROR_CODES.ERR_INVALID_FRAME,
          message: `Payload exceeds maximum permitted size of ${MAX_PAYLOAD_BYTES} bytes`,
        },
      });
      return;
    }

    const text = typeof message === "string" ? message : message.toString("utf-8");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      this.sendResponse(ws, {
        type: "response",
        id: "unknown",
        status: "error",
        error: {
          code: ERROR_CODES.ERR_INVALID_FRAME,
          message: "Malformed JSON frame received",
          details: String(err),
        },
      });
      return;
    }

    const commandParse = CommandEnvelopeSchema.safeParse(json);
    if (!commandParse.success) {
      const id =
        typeof json === "object" && json !== null && "id" in json
          ? String((json as Record<string, unknown>).id)
          : "unknown";

      this.sendResponse(ws, {
        type: "response",
        id,
        status: "error",
        error: {
          code: ERROR_CODES.ERR_INVALID_FRAME,
          message: "Invalid command envelope format",
          details: commandParse.error.issues,
        },
      });
      return;
    }

    const command = commandParse.data;

    // Handle handshake command
    if (command.name === "handshake") {
      const handshakeParse = HandshakeParamsSchema.safeParse(command.params);
      if (!handshakeParse.success) {
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "error",
          error: {
            code: ERROR_CODES.ERR_INVALID_FRAME,
            message: "Invalid handshake parameters",
            details: handshakeParse.error.issues,
          },
        });
        return;
      }

      const activeProvider = this.providerService
        ? await this.providerService.getActiveProvider().catch(() => null)
        : null;

      const result: HandshakeResult = {
        status: "ready",
        serverVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
        supportedProviders: [...VERIFIED_PROVIDER_IDS],
        activeSessionId: null,
      };

      this.sendResponse(ws, {
        type: "response",
        id: command.id,
        status: "ok",
        result,
      });
      return;
    }

    // Ping / pong command
    if (command.name === "ping") {
      this.sendResponse(ws, {
        type: "response",
        id: command.id,
        status: "ok",
        result: { pong: Date.now() },
      });
      return;
    }

    // Runtime Status command
    if (command.name === "get_runtime_status") {
      const status = this.runtimeManager
        ? this.runtimeManager.getStatus()
        : { status: "uninitialized", clientName: "kairo-ide", activeSessions: 0, uptime: 0 };

      this.sendResponse(ws, {
        type: "response",
        id: command.id,
        status: "ok",
        result: status,
      });
      return;
    }

    // Start Task command
    if (command.name === "start_task") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = StartTaskParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const sessionId = await this.sessionService.createSession(parse.data);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: {
            sessionId,
            status: "started",
          },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Send Message command
    if (command.name === "send_message") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = SendMessageParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        await this.sessionService.sendMessage(parse.data);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { ok: true },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Cancel Task command
    if (command.name === "cancel_task") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = CancelTaskParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        await this.sessionService.abortSession(parse.data.sessionId, parse.data.reason);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { cancelled: true },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Stop Task command
    if (command.name === "stop_task") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = StopTaskParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        await this.sessionService.stopSession(parse.data.sessionId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { stopped: true },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Respond Tool Approval command
    if (command.name === "respond_tool_approval") {
      if (!this.approvalCoordinator) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = RespondToolApprovalParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const handled = this.approvalCoordinator.resolveApproval(
          parse.data.approvalId,
          parse.data.approved,
          parse.data.reason,
          parse.data.sessionId
        );
        if (!handled) {
          this.sendResponse(ws, {
            type: "response",
            id: command.id,
            status: "error",
            error: {
              code: ERROR_CODES.ERR_NOT_FOUND,
              message: `Pending tool approval '${parse.data.approvalId}' not found or already resolved`,
            },
          });
          return;
        }

        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { resolved: true },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // List Sessions command
    if (command.name === "list_sessions") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = ListSessionsParamsSchema.safeParse(command.params ?? {});
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const sessions = await this.sessionService.listSessions(parse.data.limit);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { sessions },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Load Session command
    if (command.name === "load_session") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = LoadSessionParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const session = await this.sessionService.loadSession(parse.data.sessionId);
        if (!session) {
          this.sendResponse(ws, {
            type: "response",
            id: command.id,
            status: "error",
            error: {
              code: ERROR_CODES.ERR_SESSION_NOT_FOUND,
              message: `Session '${parse.data.sessionId}' was not found`,
            },
          });
          return;
        }

        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { session },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Delete Session command
    if (command.name === "delete_session") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = DeleteSessionParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const deleted = await this.sessionService.deleteSession(parse.data.sessionId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { deleted },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // -------------------------------------------------------------
    // Stage 06: Provider Management Commands
    // -------------------------------------------------------------

    // List Providers command
    if (command.name === "list_providers") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      try {
        const providers = await this.providerService.listProviders();
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { providers },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Get Provider command
    if (command.name === "get_provider") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = GetProviderParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const providerData = await this.providerService.getProvider(parse.data.providerId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: providerData,
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Configure Provider command (Add / Update patch-style)
    if (command.name === "configure_provider") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = ConfigureProviderParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const provider = await this.providerService.configureProvider(parse.data);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { provider },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Delete Provider command
    if (command.name === "delete_provider") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = DeleteProviderParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const deleted = await this.providerService.removeProvider(parse.data.providerId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { deleted },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Set Active Provider command
    if (command.name === "set_active_provider") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = SetActiveProviderParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const provider = await this.providerService.setActiveProvider(parse.data.providerId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { provider },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Get Active Provider command
    if (command.name === "get_active_provider") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      try {
        const provider = await this.providerService.getActiveProvider();
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { provider },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // List Provider Models command
    if (command.name === "list_provider_models") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = ListProviderModelsParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const models = await this.providerService.listModels(parse.data.providerId, {
          filter: parse.data.filter,
        });
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { models },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Validate Provider Credentials command
    if (command.name === "validate_provider_credentials") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = ValidateProviderCredentialsParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const validation = await this.providerService.validateCredentials(
          parse.data.providerId,
          {
            apiKey: parse.data.apiKey,
            baseUrl: parse.data.baseUrl,
          }
        );
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: validation,
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Test Provider Connectivity command
    if (command.name === "test_provider_connectivity") {
      if (!this.providerService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = TestProviderConnectivityParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const connectivity = await this.providerService.testConnectivity(parse.data.providerId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: connectivity,
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Resolve Workspace Context command
    if (command.name === "resolve_workspace_context") {
      const parse = ResolveWorkspaceContextParamsSchema.safeParse(command.params);
      if (!parse.success) {
        this.sendInvalidParams(ws, command.id, parse.error.issues);
        return;
      }

      try {
        const contextSvc =
          this.contextService ?? new ContextService(parse.data.workspaceRoot);
        const assembled = await contextSvc.resolveContext({
          workspaceRoot: parse.data.workspaceRoot,
          prompt: parse.data.query || "",
          context: parse.data.context,
          budget: parse.data.maxTokens ? { maxTotalTokens: parse.data.maxTokens } : undefined,
          searchQuery: parse.data.query,
        });

        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: {
            formattedContext: assembled.formattedPrompt,
            estimatedTokens: assembled.totalEstimatedTokens,
            includedFiles: assembled.includedFiles,
            truncated: assembled.truncated,
          },
        });
      } catch (err) {
        this.sendSanitizedError(ws, command.id, err);
      }
      return;
    }

    // Unknown command
    this.sendResponse(ws, {
      type: "response",
      id: command.id,
      status: "error",
      error: {
        code: ERROR_CODES.ERR_NOT_FOUND,
        message: `Command "${command.name}" is not recognized`,
      },
    });
  }

  private sendInvalidParams(ws: ServerWebSocket<SocketData>, id: string, issues: unknown): void {
    this.sendResponse(ws, {
      type: "response",
      id,
      status: "error",
      error: {
        code: ERROR_CODES.ERR_INVALID_FRAME,
        message: "Invalid command parameters",
        details: issues,
      },
    });
  }

  private sendNotImplemented(ws: ServerWebSocket<SocketData>, id: string, commandName: string): void {
    this.sendResponse(ws, {
      type: "response",
      id,
      status: "error",
      error: {
        code: ERROR_CODES.ERR_NOT_FOUND,
        message: `Service for command "${commandName}" is not available`,
      },
    });
  }

  private sendSanitizedError(ws: ServerWebSocket<SocketData>, id: string, err: unknown): void {
    const sanitized = AgentErrorHandler.handle(err);
    this.sendResponse(ws, {
      type: "response",
      id,
      status: "error",
      error: sanitized,
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const pingMsg = JSON.stringify({ type: "ping", timestamp: Date.now() });
      for (const ws of this.sockets) {
        try {
          ws.send(pingMsg);
        } catch {
          this.sockets.delete(ws);
        }
      }
    }, HEARTBEAT_PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
