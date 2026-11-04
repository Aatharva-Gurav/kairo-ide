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

export const CursorPositionSchema = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});

export const ActiveDocumentContextSchema = z.object({
  path: z.string().min(1),
  language: z.string(),
  content: z.string().optional(),
  isDirty: z.boolean().default(false),
  cursorPosition: CursorPositionSchema.optional(),
  selection: z.string().optional(),
});

export const OpenDocumentContextSchema = z.object({
  path: z.string().min(1),
  title: z.string(),
  language: z.string(),
  isDirty: z.boolean().default(false),
  content: z.string().optional(),
});

export const DiagnosticItemSchema = z.object({
  filePath: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning", "info", "hint"]).default("error"),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  source: z.string().optional(),
});

export const WorkspaceContextPayloadSchema = z.object({
  workspaceRoot: z.string().min(1),
  workspaceName: z.string().optional(),
  activeDocument: ActiveDocumentContextSchema.optional(),
  openDocuments: z.array(OpenDocumentContextSchema).optional(),
  diagnostics: z.array(DiagnosticItemSchema).optional(),
  terminalOutput: z.string().optional(),
  projectMetadata: z
    .object({
      projectTypes: z.array(z.string()).optional(),
      dependencies: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

export const ResolveWorkspaceContextParamsSchema = z.object({
  workspaceRoot: z.string().min(1),
  query: z.string().optional(),
  context: WorkspaceContextPayloadSchema.optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const ResolveWorkspaceContextResultSchema = z.object({
  formattedPrompt: z.string(),
  totalEstimatedTokens: z.number().int().nonnegative(),
  includedFiles: z.array(z.string()),
  truncated: z.boolean(),
});

export const StartTaskParamsSchema = z.object({
  prompt: z.string().min(1),
  mode: AgentModeSchema.default("act").optional(),
  providerId: z.string().min(1).default("anthropic").optional(),
  modelId: z.string().min(1).default("claude-3-7-sonnet-20250219").optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  workspacePath: z.string().optional(),
  context: WorkspaceContextPayloadSchema.optional(),
});

export const StartTaskResultSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
});

export const SendMessageParamsSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  mode: AgentModeSchema.optional(),
  context: WorkspaceContextPayloadSchema.optional(),
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
  sessionId: z.string().optional(),
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const ToolApprovalRequestPayloadSchema = z.object({
  approvalId: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().optional(),
  toolName: z.string().min(1),
  action: z.string().min(1),
  risk: z.enum(["read_only", "low", "moderate", "high", "critical"]),
  exactArguments: z.unknown(),
  argumentsHash: z.string().min(1),
  workspace: z.string().min(1),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
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

/**
 * Provider and Model Management Command Schemas (Stage 06).
 */

export const ProviderContextLimitsSchema = z.object({
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const ProviderReasoningSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  budgetTokens: z.number().int().positive().optional(),
});

export const AwsProviderSettingsSchema = z.object({
  region: z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  sessionToken: z.string().optional(),
  profile: z.string().optional(),
  authentication: z.enum(["iam", "api-key", "apikey", "profile"]).optional(),
  useCrossRegionInference: z.boolean().optional(),
  useGlobalInference: z.boolean().optional(),
  usePromptCache: z.boolean().optional(),
  endpoint: z.string().optional(),
});

export const ProviderSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  client: z.string(),
  defaultModelId: z.string(),
  selectedModelId: z.string(),
  baseUrl: z.string().optional(),
  capabilities: z.array(z.string()),
  isConfigured: z.boolean(),
  isActive: z.boolean(),
  hasCustomBaseUrl: z.boolean(),
  contextLimits: ProviderContextLimitsSchema.optional(),
  reasoning: ProviderReasoningSettingsSchema.optional(),
  updatedAt: z.number().optional(),
  docsUrl: z.string().optional(),
});

export const ConfigureProviderParamsSchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().optional(),
  modelId: z.string().optional(),
  baseUrl: z.string().optional(),
  contextLimits: ProviderContextLimitsSchema.optional(),
  reasoning: ProviderReasoningSettingsSchema.optional(),
  capabilities: z.array(z.string()).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  aws: AwsProviderSettingsSchema.optional(),
  setActive: z.boolean().optional(),
});

export const ConfigureProviderResultSchema = z.object({
  provider: ProviderSummarySchema,
});

export const GetProviderParamsSchema = z.object({
  providerId: z.string().min(1),
});

export const DeleteProviderParamsSchema = z.object({
  providerId: z.string().min(1),
});

export const SetActiveProviderParamsSchema = z.object({
  providerId: z.string().min(1),
});

export const ListProviderModelsParamsSchema = z.object({
  providerId: z.string().min(1),
  filter: z.literal("chat").optional(),
});

export const ValidateProviderCredentialsParamsSchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export const TestProviderConnectivityParamsSchema = z.object({
  providerId: z.string().min(1),
});

export const ProviderConnectivityResultSchema = z.object({
  ok: z.boolean(),
  providerId: z.string(),
  latencyMs: z.number().nonnegative(),
  modelVerified: z.boolean().optional(),
  error: z.string().optional(),
  details: z.unknown().optional(),
});

export const TokenUsagePayloadSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  cacheReadTokens: z.number().nonnegative().optional(),
  cacheWriteTokens: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  totalInputTokens: z.number().nonnegative().optional(),
  totalOutputTokens: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
});
