import { invoke } from "@tauri-apps/api/core";
import {
  CommandEnvelope,
  EventEnvelope,
  HandshakeParams,
  HandshakeResult,
  ResolveWorkspaceContextParams,
  ResolveWorkspaceContextResult,
} from "../../../lib/ai-agent/types";
import {
  PROTOCOL_VERSION,
  DEFAULT_RPC_TIMEOUT_MS,
  MAX_PAYLOAD_BYTES,
  HEARTBEAT_PING_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  ERROR_CODES,
  COMMAND_NAMES,
} from "../../../lib/ai-agent/protocol-constants";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting"
  | "error";

export interface DesktopBackendEndpoint {
  httpUrl: string;
  wsUrl: string;
  port: number;
  token: string;
  pid: number;
}

export type EventHandler<T = unknown> = (
  payload: T,
  envelope: EventEnvelope
) => void;

export type StateChangeHandler = (state: ConnectionState) => void;

export interface DesktopTransportOptions {
  getEndpoint?: () => Promise<DesktopBackendEndpoint>;
  autoConnect?: boolean;
  rpcTimeoutMs?: number;
  maxPayloadBytes?: number;
}

export interface TransportRpcError extends Error {
  code: string;
  details?: unknown;
}

export class DesktopTransport {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private activeEndpoint: DesktopBackendEndpoint | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private disposed = false;

  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private readonly eventListeners = new Map<string, Set<EventHandler<unknown>>>();
  private readonly stateListeners = new Set<StateChangeHandler>();
  private readonly lastSequencePerSession = new Map<string, number>();

  private readonly getEndpointFn: () => Promise<DesktopBackendEndpoint>;
  private readonly rpcTimeoutMs: number;
  private readonly maxPayloadBytes: number;

  constructor(options: DesktopTransportOptions = {}) {
    this.getEndpointFn =
      options.getEndpoint ??
      (async () => {
        return await invoke<DesktopBackendEndpoint>("get_desktop_backend_endpoint");
      });
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    this.maxPayloadBytes = options.maxPayloadBytes ?? MAX_PAYLOAD_BYTES;

    if (options.autoConnect) {
      this.connect().catch((err) => {
        console.error("[DesktopTransport] Initial connection failed:", err);
      });
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getEndpoint(): DesktopBackendEndpoint | null {
    return this.activeEndpoint;
  }

  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateListeners.add(handler);
    handler(this.state);
    return () => this.stateListeners.delete(handler);
  }

  public on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = new Set();
      this.eventListeners.set(event, set);
    }
    set.add(handler as EventHandler<unknown>);
    return () => {
      set?.delete(handler as EventHandler<unknown>);
      if (set?.size === 0) {
        this.eventListeners.delete(event);
      }
    };
  }

  public async connect(): Promise<void> {
    if (
      this.disposed ||
      this.state === "connected" ||
      this.state === "connecting" ||
      this.state === "authenticating"
    ) {
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    try {
      this.activeEndpoint = await this.getEndpointFn();
      const wsUrl = `${this.activeEndpoint.wsUrl}?approval_token=${encodeURIComponent(
        this.activeEndpoint.token
      )}`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.setState("authenticating");
        this.performHandshake()
          .then(() => {
            if (this.ws !== socket) return;
            this.reconnectAttempt = 0;
            this.lastActivityAt = Date.now();
            this.startHeartbeat();
            this.setState("connected");
          })
          .catch((err) => {
            console.error("[DesktopTransport] Handshake failed:", err);
            socket.close(1008, "Handshake failed");
            this.handleDisconnect();
          });
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        this.lastActivityAt = Date.now();
        this.handleIncomingMessage(event.data);
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.handleDisconnect();
      };

      socket.onerror = (err) => {
        console.warn("[DesktopTransport] WebSocket error:", err);
      };
    } catch (err) {
      console.error("[DesktopTransport] Failed to fetch endpoint or connect:", err);
      this.handleDisconnect();
    }
  }

  public async sendCommand<TResult = unknown, TParams = unknown>(
    name: string,
    params?: TParams,
    timeoutMs?: number
  ): Promise<TResult> {
    if (this.state !== "connected" && this.state !== "authenticating") {
      throw new Error(
        `Cannot send command "${name}" while transport is in state "${this.state}"`
      );
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket is not connected (readyState: ${this.ws?.readyState})`);
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const envelope: CommandEnvelope<string, TParams> = {
      type: "command",
      id,
      name,
      params,
    };

    const payload = JSON.stringify(envelope);
    if (payload.length > this.maxPayloadBytes) {
      throw new Error(
        `Command payload exceeds maximum permitted size of ${this.maxPayloadBytes} bytes`
      );
    }

    const effectiveTimeout = timeoutMs ?? this.rpcTimeoutMs;

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `RPC timeout: command "${name}" (id: ${id}) did not respond within ${effectiveTimeout}ms`
          )
        );
      }, effectiveTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (res: unknown) => void,
        reject,
        timer,
      });

      this.ws?.send(payload);
    });
  }

  public async resolveWorkspaceContext(
    params: ResolveWorkspaceContextParams
  ): Promise<ResolveWorkspaceContextResult> {
    return this.sendCommand<ResolveWorkspaceContextResult>(
      COMMAND_NAMES.RESOLVE_WORKSPACE_CONTEXT,
      params
    );
  }

  private async performHandshake(): Promise<HandshakeResult> {
    const params: HandshakeParams = {
      clientVersion: "0.1.0",
      protocolVersion: PROTOCOL_VERSION,
      ideContext: {
        platform:
          typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")
            ? "win32"
            : "darwin",
      },
    };

    const result = await this.sendCommand<HandshakeResult>("handshake", params, 10000);
    if (result.status !== "ready") {
      throw new Error(`Unexpected handshake response status: ${result.status}`);
    }
    return result;
  }

  private handleIncomingMessage(raw: unknown): void {
    const text = typeof raw === "string" ? raw : String(raw);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.warn("[DesktopTransport] Received invalid JSON frame");
      return;
    }

    if (parsed.type === "response" && typeof parsed.id === "string") {
      const pending = this.pendingRequests.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(parsed.id);
        if (parsed.status === "ok") {
          pending.resolve(parsed.result);
        } else {
          const errObj = parsed.error as { message?: string; code?: string; details?: unknown } | undefined;
          const err = new Error(errObj?.message || "Server error") as TransportRpcError;
          err.code = errObj?.code || ERROR_CODES.ERR_INTERNAL;
          err.details = errObj?.details;
          pending.reject(err);
        }
      }
      return;
    }

    if (parsed.type === "event" && typeof parsed.event === "string") {
      const eventEnvelope = parsed as EventEnvelope;

      // Event sequence deduplication & gap detection
      if (eventEnvelope.sessionId) {
        const lastSeq = this.lastSequencePerSession.get(eventEnvelope.sessionId) ?? -1;
        if (eventEnvelope.seq <= lastSeq) {
          // Drop duplicate event
          return;
        }
        if (lastSeq >= 0 && eventEnvelope.seq > lastSeq + 1) {
          console.warn(
            `[DesktopTransport] Event sequence gap detected in session ${eventEnvelope.sessionId}: expected ${
              lastSeq + 1
            }, got ${eventEnvelope.seq}`
          );
        }
        this.lastSequencePerSession.set(eventEnvelope.sessionId, eventEnvelope.seq);
      }

      const listeners = this.eventListeners.get(eventEnvelope.event);
      if (listeners) {
        for (const handler of listeners) {
          try {
            handler(eventEnvelope.payload, eventEnvelope);
          } catch (err) {
            console.error(
              `[DesktopTransport] Error in handler for event "${eventEnvelope.event}":`,
              err
            );
          }
        }
      }
    }
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.ws = null;

    // Fail all pending RPC requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error(`Connection closed before response received for request ${id}`));
    }
    this.pendingRequests.clear();

    if (this.disposed) {
      this.setState("disconnected");
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const backoff = Math.min(1000 * Math.pow(1.5, this.reconnectAttempt), 10000);
    const jitter = Math.random() * 500;
    const delay = backoff + jitter;
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.warn("[DesktopTransport] Reconnect attempt failed:", err);
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "connected") return;

      const idleMs = Date.now() - this.lastActivityAt;
      if (idleMs > HEARTBEAT_TIMEOUT_MS) {
        console.warn(
          `[DesktopTransport] Heartbeat timeout: no activity for ${idleMs}ms, reconnecting...`
        );
        this.ws?.close(1001, "Heartbeat timeout");
        return;
      }

      this.sendCommand("ping", undefined, 5000).catch(() => {
        // ping failure handled by timeout
      });
    }, HEARTBEAT_PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const listener of this.stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error("[DesktopTransport] State listener threw an error:", err);
      }
    }
  }

  public disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "Normal closure");
      this.ws = null;
    }
    this.setState("disconnected");
  }
}
