import { z } from "zod";

/**
 * Discriminator schemas for the three wire transport envelopes.
 */

export const CommandEnvelopeSchema = z.object({
  type: z.literal("command"),
  id: z.string().min(1),
  name: z.string().min(1),
  params: z.unknown().optional(),
});

export const SuccessResponseEnvelopeSchema = z.object({
  type: z.literal("response"),
  id: z.string().min(1),
  status: z.literal("ok"),
  result: z.unknown().optional(),
});

export const ErrorResponseEnvelopeSchema = z.object({
  type: z.literal("response"),
  id: z.string().min(1),
  status: z.literal("error"),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const ResponseEnvelopeSchema = z.discriminatedUnion("status", [
  SuccessResponseEnvelopeSchema,
  ErrorResponseEnvelopeSchema,
]);

export const EventEnvelopeSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  payload: z.unknown(),
});

/**
 * Handshake contract schemas.
 */

export const HandshakeParamsSchema = z.object({
  clientVersion: z.string(),
  protocolVersion: z.string(),
  ideContext: z
    .object({
      activeWorkspacePath: z.string().nullable().optional(),
      platform: z.enum(["win32", "darwin", "linux"]).optional(),
      theme: z.string().optional(),
    })
    .optional(),
});

export const HandshakeResultSchema = z.object({
  status: z.literal("ready"),
  serverVersion: z.string(),
  protocolVersion: z.string(),
  supportedProviders: z.array(z.string()),
  activeSessionId: z.string().nullable().optional(),
});

/**
 * HTTP /health endpoint response schema.
 */

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptime: z.number().nonnegative(),
  pid: z.number().int().positive(),
  protocolVersion: z.string(),
});

/**
 * Task and Session Command Schemas (Stage 05).
 */

export const AgentModeSchema = z.enum(["plan", "act"]);

export const StartTaskParamsSchema = z.object({
  prompt: z.string().min(1),
  mode: AgentModeSchema.default("act").optional(),
  providerId: z.string().min(1).default("anthropic").optional(),
  modelId: z.string().min(1).default("claude-3-7-sonnet-20250219").optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  workspacePath: z.string().optional(),
});

export const StartTaskResultSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
});

export const SendMessageParamsSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  mode: AgentModeSchema.optional(),
});

export const CancelTaskParamsSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().optional(),
});

export const StopTaskParamsSchema = z.object({
  sessionId: z.string().min(1),
});

export const RespondToolApprovalParamsSchema = z.object({
  approvalId: z.string().min(1),
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const ListSessionsParamsSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export const LoadSessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

export const DeleteSessionParamsSchema = z.object({
  sessionId: z.string().min(1),
});

export const RuntimeStatusResultSchema = z.object({
  status: z.enum(["uninitialized", "initializing", "ready", "disposing", "disposed", "error"]),
  clientName: z.string().optional(),
  activeSessions: z.number().int().nonnegative(),
  uptime: z.number().nonnegative(),
});
