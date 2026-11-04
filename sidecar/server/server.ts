import type { Server, ServerWebSocket } from "bun";
import crypto from "node:crypto";
import { SidecarConfig } from "../schemas/config";
import { Logger } from "../utils/logger";
import { ConnectionManager, SocketData } from "./connection";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PermissionManager } from "../permissions/permission-manager";
import { PathValidator } from "../security/path-validator";
import { CommandGuard } from "../security/command-guard";
import { AuditLogger } from "../security/audit-logger";
import { EventAdapter } from "../runtime/event-adapter";
import { RuntimeManager } from "../runtime/manager";
import { SessionService } from "../sessions";
import { ProviderService } from "../providers/service";
import { ContextService } from "../context/context-service";
import { PROTOCOL_VERSION, EVENT_NAMES } from "../../lib/ai-agent/protocol-constants";
import { HealthResponse } from "../../lib/ai-agent/types";

export interface SidecarInstance {
  port: number;
  url: string;
  connectionManager: ConnectionManager;
  runtimeManager: RuntimeManager;
  sessionService: SessionService;
  approvalCoordinator: ApprovalCoordinator;
  permissionManager: PermissionManager;
  auditLogger: AuditLogger;
  providerService: ProviderService;
  contextService?: ContextService;
  stop: () => Promise<void>;
}

function timingSafeTokenCompare(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function isValidOrigin(origin: string | null): boolean {
  if (!origin) {
    return true; // Allow programmatic/test connections without origin
  }
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();

    if (protocol === "tauri:" || host === "localhost" || host === "127.0.0.1") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function startSidecarServer(
  config: SidecarConfig,
  customLogger?: Logger
): SidecarInstance {
  const logger = (customLogger ?? new Logger("sidecar")).child("server");
  const approvalCoordinator = new ApprovalCoordinator(logger);
  const pathValidator = new PathValidator();
  const commandGuard = new CommandGuard();
  const auditLogger = new AuditLogger();
  const permissionManager = new PermissionManager({
    logger,
    approvalCoordinator,
    pathValidator,
    commandGuard,
    auditLogger,
  });

  const eventAdapter = new EventAdapter();
  const providerService = new ProviderService({ logger });
  const contextService = new ContextService(process.cwd());
  const runtimeManager = new RuntimeManager(logger, {
    clientName: "kairo-ide",
    approvalCoordinator,
    permissionManager,
    fetchImpl: config.fetchImpl,
  });
  const sessionService = new SessionService(
    logger,
    runtimeManager,
    eventAdapter,
    approvalCoordinator,
    providerService,
    contextService
  );
  permissionManager.setSessionContextProvider(sessionService);

  const connectionManager = new ConnectionManager(logger, {
    sessionService,
    approvalCoordinator,
    runtimeManager,
    providerService,
    permissionManager,
    contextService,
  });

  // Wire approval coordinator notifier to broadcast tool_approval_request events to connected clients
  approvalCoordinator.setNotifier((payload) => {
    connectionManager.broadcastEvent({
      type: "event",
      event: EVENT_NAMES.TOOL_APPROVAL_REQUEST,
      sessionId: payload.sessionId,
      taskId: payload.taskId,
      seq: 0,
      timestamp: payload.createdAt,
      payload,
    });
  });

  let bunServer: Server<SocketData> | null = null;

  bunServer = Bun.serve<SocketData>({
    hostname: "127.0.0.1",
    port: config.port,
    fetch(req: Request, server: Server<SocketData>) {
      const url = new URL(req.url);

      // Enforce Origin check on all incoming requests
      const origin = req.headers.get("origin");
      if (!isValidOrigin(origin)) {
        logger.warn(`Rejected request from forbidden origin: ${origin}`);
        return new Response("Forbidden origin", { status: 403 });
      }

      // HTTP GET /health
      if (req.method === "GET" && url.pathname === "/health") {
        const body: HealthResponse = {
          status: "ok",
          version: "0.1.0",
          uptime: process.uptime(),
          pid: process.pid,
          protocolVersion: PROTOCOL_VERSION,
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }

      // Upgrade WebSocket for /transport
      if (url.pathname === "/transport") {
        const tokenFromQuery = url.searchParams.get("approval_token");
        const tokenFromHeader = req.headers.get("x-approval-token");
        const providedToken = tokenFromQuery || tokenFromHeader || "";

        if (!timingSafeTokenCompare(providedToken, config.approvalToken)) {
          logger.warn(`Unauthorized WebSocket upgrade attempt from ${req.headers.get("host")}`);
          return new Response("Unauthorized: invalid or missing approval token", {
            status: 401,
          });
        }

        const socketData: SocketData = {
          id: crypto.randomUUID(),
          connectedAt: Date.now(),
          lastPingAt: Date.now(),
          isAlive: true,
          authenticated: true,
        };

        const upgraded = server.upgrade(req, { data: socketData });
        if (upgraded) {
          return undefined;
        }

        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Unmatched route
      return new Response("Not Found", { status: 404 });
    },

    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        connectionManager.register(ws);
      },
      message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
        connectionManager.handleMessage(ws, message).catch((err) => {
          logger.error("Unhandled error processing message", err);
        });
      },
      close(ws: ServerWebSocket<SocketData>, code: number, reason: string) {
        logger.debug(`WebSocket closed code=${code} reason=${reason}`);
        connectionManager.unregister(ws);
      },
      drain(ws: ServerWebSocket<SocketData>) {
        logger.debug(`WebSocket backpressure drained for socket ${ws.data.id}`);
      },
    },
  });

  const actualPort = (bunServer.port ?? config.port) as number;
  const serverUrl = `http://127.0.0.1:${actualPort}`;
  const wsUrl = `ws://127.0.0.1:${actualPort}/transport`;

  logger.info(`Kairo AI Agent sidecar running at ${serverUrl} (ws: ${wsUrl})`);

  // Emit structured ready line to stdout for Rust process supervisor
  const readyLine = JSON.stringify({
    type: "ready",
    endpoint: serverUrl,
    wsEndpoint: wsUrl,
    port: actualPort,
    pid: process.pid,
  });
  console.log(readyLine);

  let isStopping = false;

  const stop = async (): Promise<void> => {
    if (isStopping) return;
    isStopping = true;
    logger.info("Stopping sidecar server...");

    connectionManager.closeAll();
    sessionService.dispose();
    await runtimeManager.dispose();

    if (bunServer) {
      bunServer.stop(true);
      bunServer = null;
    }

    logger.info("Sidecar server stopped successfully");
  };

  return {
    port: actualPort,
    url: serverUrl,
    connectionManager,
    runtimeManager,
    sessionService,
    approvalCoordinator,
    permissionManager,
    auditLogger,
    providerService,
    contextService,
    stop,
  };
}
