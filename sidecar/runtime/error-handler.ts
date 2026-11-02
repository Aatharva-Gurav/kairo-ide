import { ERROR_CODES, ErrorCode } from "../../lib/ai-agent/protocol-constants";
import { redactString } from "../utils/redaction";

export interface SanitizedAgentError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AgentErrorHandler {
  public static handle(err: unknown): SanitizedAgentError {
    if (!err) {
      return {
        code: ERROR_CODES.ERR_INTERNAL,
        message: "An unknown error occurred",
      };
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitized = redactString(rawMessage);
    const lower = sanitized.toLowerCase();

    // 1. Session Not Found
    if (lower.includes("session_not_found") || lower.includes("session not found")) {
      return {
        code: ERROR_CODES.ERR_SESSION_NOT_FOUND,
        message: "The requested agent session could not be found or has expired.",
      };
    }

    // 2. Authentication Failures
    if (
      lower.includes("401") ||
      lower.includes("unauthorized") ||
      lower.includes("invalid api key") ||
      lower.includes("authentication failed") ||
      lower.includes("invalid token")
    ) {
      return {
        code: ERROR_CODES.ERR_AUTH_FAILED,
        message: "Model provider authentication failed. Please verify your API key or provider credentials.",
      };
    }

    // 3. Rate Limit / Quota Exceeded
    if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota exceeded") || lower.includes("too many requests")) {
      return {
        code: ERROR_CODES.ERR_RATE_LIMIT,
        message: "Model provider rate limit or quota exceeded. Please wait a moment before trying again.",
      };
    }

    // 4. Context Overflow
    if (lower.includes("context length") || lower.includes("maximum context") || lower.includes("token limit") || lower.includes("prompt is too long")) {
      return {
        code: ERROR_CODES.ERR_CONTEXT_OVERFLOW,
        message: "Context window limit reached. Consider compacting the task history or starting a new session.",
      };
    }

    // 5. Unsupported Model
    if (lower.includes("model not found") || lower.includes("unsupported model") || lower.includes("does not exist") || lower.includes("invalid model")) {
      return {
        code: ERROR_CODES.ERR_UNSUPPORTED_MODEL,
        message: `The specified model is not supported or accessible by this provider: ${sanitized}`,
      };
    }

    // 6. User cancellation / Abort
    if (lower.includes("abort") || lower.includes("cancel") || lower.includes("interrupted")) {
      return {
        code: ERROR_CODES.ERR_ABORTED,
        message: "Operation was aborted or cancelled.",
      };
    }

    // 7. General Tool Failure
    if (lower.includes("tool failed") || lower.includes("tool execution")) {
      return {
        code: ERROR_CODES.ERR_TOOL_FAILED,
        message: `Tool execution failed: ${sanitized}`,
      };
    }

    // Default Fallback
    return {
      code: ERROR_CODES.ERR_INTERNAL,
      message: sanitized,
    };
  }
}
