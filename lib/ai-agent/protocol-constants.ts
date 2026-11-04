/**
 * Shared AI Agent Transport Protocol Constants.
 */
export const PROTOCOL_VERSION = "1.0.0";
export const DEFAULT_SIDECAR_PORT = 49152;
export const DEFAULT_RPC_TIMEOUT_MS = 30000;
export const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MB
export const HEARTBEAT_PING_INTERVAL_MS = 15000;
export const HEARTBEAT_TIMEOUT_MS = 35000;

export const COMMAND_NAMES = {
  HANDSHAKE: "handshake",
  PING: "ping",
  GET_RUNTIME_STATUS: "get_runtime_status",
  START_TASK: "start_task",
  SEND_MESSAGE: "send_message",
  CANCEL_TASK: "cancel_task",
  STOP_TASK: "stop_task",
  RESPOND_TOOL_APPROVAL: "respond_tool_approval",
  LIST_SESSIONS: "list_sessions",
  LOAD_SESSION: "load_session",
  DELETE_SESSION: "delete_session",
  LIST_PROVIDERS: "list_providers",
  GET_PROVIDER: "get_provider",
  CONFIGURE_PROVIDER: "configure_provider",
  DELETE_PROVIDER: "delete_provider",
  SET_ACTIVE_PROVIDER: "set_active_provider",
  GET_ACTIVE_PROVIDER: "get_active_provider",
  LIST_PROVIDER_MODELS: "list_provider_models",
  VALIDATE_PROVIDER_CREDENTIALS: "validate_provider_credentials",
  TEST_PROVIDER_CONNECTIVITY: "test_provider_connectivity",
  RESOLVE_WORKSPACE_CONTEXT: "resolve_workspace_context",
} as const;

export type CommandName = (typeof COMMAND_NAMES)[keyof typeof COMMAND_NAMES];

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
  ERR_PROVIDER_NOT_FOUND: "ERR_PROVIDER_NOT_FOUND",
  ERR_PROVIDER_NOT_CONFIGURED: "ERR_PROVIDER_NOT_CONFIGURED",
  ERR_INVALID_CREDENTIALS: "ERR_INVALID_CREDENTIALS",
  ERR_PROVIDER_CONNECTIVITY_FAILED: "ERR_PROVIDER_CONNECTIVITY_FAILED",
  ERR_VAULT_ERROR: "ERR_VAULT_ERROR",
  ERR_PERMISSION_DENIED: "ERR_PERMISSION_DENIED",
  ERR_APPROVAL_EXPIRED: "ERR_APPROVAL_EXPIRED",
  ERR_APPROVAL_NOT_FOUND: "ERR_APPROVAL_NOT_FOUND",
  ERR_PATH_ESCAPE: "ERR_PATH_ESCAPE",
  ERR_PLAN_MODE_VIOLATION: "ERR_PLAN_MODE_VIOLATION",
  ERR_PROMPT_INJECTION_DETECTED: "ERR_PROMPT_INJECTION_DETECTED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
