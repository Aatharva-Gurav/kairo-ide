import type { Server, ServerWebSocket } from "bun";
import crypto from "node:crypto";
import { SidecarConfig } from "../schemas/config";
import { Logger } from "../utils/logger";
import { ConnectionManager, SocketData } from "./connection";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { EventAdapter } from "../runtime/event-adapter";
import { RuntimeManager } from "../runtime/manager";
import { SessionService } from "../sessions";
import { PROTOCOL_VERSION } from "../../lib/ai-agent/protocol-constants";
import { HealthResponse } from "../../lib/ai-agent/types";

export interface SidecarInstance {
  port: number;
  url: string;
  connectionManager: ConnectionManager;
  runtimeManager: RuntimeManager;
  sessionService: SessionService;
  approvalCoordinator: ApprovalCoordinator;
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
  const eventAdapter = new EventAdapter();
  const runtimeManager = new RuntimeManager(logger, {
    clientName: "kairo-ide",
    approvalCoordinator,
    fetchImpl: config.fetchImpl,
  });
  const sessionService = new SessionService(
    logger,
    runtimeManager,
    eventAdapter,
    approvalCoordinator
  );
  const connectionManager = new ConnectionManager(logger, {
    sessionService,
    approvalCoordinator,
    runtimeManager,
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

      // WebSocket Upgrade on /transport
      if (url.pathname === "/transport") {
        // Enforce Origin check
        const origin = req.headers.get("origin");
        if (!isValidOrigin(origin)) {
          logger.warn(`Rejected WebSocket upgrade from forbidden origin: ${origin}`);
          return new Response("Forbidden origin", { status: 403 });
        }

        // Validate secret approval-token
        const tokenInHeader = req.headers.get("x-approval-token");
        const tokenInQuery = url.searchParams.get("approval_token");
        const providedToken = tokenInHeader ?? tokenInQuery ?? "";

        if (!timingSafeTokenCompare(providedToken, config.approvalToken)) {
          logger.warn("Rejected unauthorized WebSocket upgrade: invalid token");
          return new Response("Unauthorized", { status: 401 });
        }

        const socketId = `sock_${Math.random().toString(36).substring(2, 10)}`;
        const upgraded = server.upgrade(req, {
          data: {
            id: socketId,
            connectedAt: Date.now(),
            lastPingAt: Date.now(),
            isAlive: true,
            authenticated: true,
          },
        });

        if (upgraded) {
          return undefined;
        }

        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Default 404
      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        connectionManager.register(ws);
      },
      message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
        connectionManager.handleMessage(ws, message);
      },
      close(ws: ServerWebSocket<SocketData>) {
        connectionManager.unregister(ws);
      },
      error(err: Error, ws: ServerWebSocket<SocketData>) {
        logger.error(`WebSocket socket error for ${ws?.data?.id ?? "unknown"}: ${err.message}`, err);
      },
    },
  });

  const actualPort = bunServer.port ?? 0;
  const serverUrl = `http://127.0.0.1:${actualPort}`;
  const wsUrl = `ws://127.0.0.1:${actualPort}/transport`;
  logger.info(`Sidecar server listening on ${serverUrl} (PID: ${process.pid})`);

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
    stop,
  };
}
