/**
 * Shared AI Agent Transport Protocol Constants.
 */
export const PROTOCOL_VERSION = "1.0.0";
export const DEFAULT_SIDECAR_PORT = 49152;
export const DEFAULT_RPC_TIMEOUT_MS = 30000;
export const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MB
export const HEARTBEAT_PING_INTERVAL_MS = 15000;
export const HEARTBEAT_TIMEOUT_MS = 35000;

export const EVENT_NAMES = {
  TOKEN_DELTA: "token_delta",
  ASSISTANT_MESSAGE: "assistant_message",
  TOOL_APPROVAL_REQUEST: "tool_approval_request",
  TOOL_STARTED: "tool_started",
  TOOL_PROGRESS: "tool_progress",
  TOOL_COMPLETED: "tool_completed",
  TOOL_FAILED: "tool_failed",
  USAGE_UPDATE: "usage_update",
  TURN_START: "turn_start",
  TURN_COMPLETE: "turn_complete",
  TASK_COMPLETE: "task_complete",
  SESSION_STATUS: "session_status",
  AGENT_ERROR: "agent_error",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export const ERROR_CODES = {
  ERR_INVALID_CONFIG: "ERR_INVALID_CONFIG",
  ERR_UNAUTHORIZED: "ERR_UNAUTHORIZED",
  ERR_INVALID_FRAME: "ERR_INVALID_FRAME",
  ERR_NOT_FOUND: "ERR_NOT_FOUND",
  ERR_TIMEOUT: "ERR_TIMEOUT",
  ERR_ABORTED: "ERR_ABORTED",
  ERR_INTERNAL: "ERR_INTERNAL",
  ERR_AUTH_FAILED: "ERR_AUTH_FAILED",
  ERR_UNSUPPORTED_MODEL: "ERR_UNSUPPORTED_MODEL",
  ERR_RATE_LIMIT: "ERR_RATE_LIMIT",
  ERR_CONTEXT_OVERFLOW: "ERR_CONTEXT_OVERFLOW",
  ERR_TOOL_FAILED: "ERR_TOOL_FAILED",
  ERR_SESSION_NOT_FOUND: "ERR_SESSION_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
