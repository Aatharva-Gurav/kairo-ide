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
import { RuntimeManager } from "../runtime/manager";
import { AgentErrorHandler } from "../runtime/error-handler";

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
}

export class ConnectionManager {
  private readonly sockets = new Set<ServerWebSocket<SocketData>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;
  private readonly sessionService?: SessionService;
  private readonly approvalCoordinator?: ApprovalCoordinator;
  private readonly runtimeManager?: RuntimeManager;
  private eventSeq = 0;

  constructor(logger: Logger, options: ConnectionManagerOptions = {}) {
    this.logger = logger.child("connection-manager");
    this.sessionService = options.sessionService;
    this.approvalCoordinator = options.approvalCoordinator;
    this.runtimeManager = options.runtimeManager;

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

      const result: HandshakeResult = {
        status: "ready",
        serverVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
        supportedProviders: [
          "anthropic",
          "openrouter",
          "openai",
          "ollama",
          "gemini",
        ],
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

      const resolved = this.approvalCoordinator.resolveApproval(
        parse.data.approvalId,
        parse.data.approved,
        parse.data.reason
      );

      this.sendResponse(ws, {
        type: "response",
        id: command.id,
        status: "ok",
        result: { resolved },
      });
      return;
    }

    // List Sessions command
    if (command.name === "list_sessions") {
      if (!this.sessionService) {
        this.sendNotImplemented(ws, command.id, command.name);
        return;
      }

      const parse = ListSessionsParamsSchema.safeParse(command.params || {});
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

    // Load Session (read messages) command
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
        const messages = await this.sessionService.readMessages(parse.data.sessionId);
        this.sendResponse(ws, {
          type: "response",
          id: command.id,
          status: "ok",
          result: { messages },
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
