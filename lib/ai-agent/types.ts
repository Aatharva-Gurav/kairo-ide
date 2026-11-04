import { z } from "zod";
import {
  HandshakeParamsSchema,
  HandshakeResultSchema,
  HealthResponseSchema,
  AgentModeSchema,
  StartTaskParamsSchema,
  StartTaskResultSchema,
  SendMessageParamsSchema,
  CancelTaskParamsSchema,
  StopTaskParamsSchema,
  RespondToolApprovalParamsSchema,
  ListSessionsParamsSchema,
  LoadSessionParamsSchema,
  DeleteSessionParamsSchema,
  RuntimeStatusResultSchema,
  ProviderContextLimitsSchema,
  ProviderReasoningSettingsSchema,
  AwsProviderSettingsSchema,
  ProviderSummarySchema,
  ConfigureProviderParamsSchema,
  ConfigureProviderResultSchema,
  GetProviderParamsSchema,
  DeleteProviderParamsSchema,
  SetActiveProviderParamsSchema,
  ListProviderModelsParamsSchema,
  ValidateProviderCredentialsParamsSchema,
  TestProviderConnectivityParamsSchema,
  ProviderConnectivityResultSchema,
  TokenUsagePayloadSchema,
  ToolApprovalRequestPayloadSchema,
  CursorPositionSchema,
  ActiveDocumentContextSchema,
  OpenDocumentContextSchema,
  DiagnosticItemSchema,
  WorkspaceContextPayloadSchema,
  ResolveWorkspaceContextParamsSchema,
  ResolveWorkspaceContextResultSchema,
} from "./transport-schema";

export type CommandEnvelope<TName extends string = string, TParams = unknown> = {
  type: "command";
  id: string;
  name: TName;
  params?: TParams;
};

export type SuccessResponseEnvelope<TResult = unknown> = {
  type: "response";
  id: string;
  status: "ok";
  result?: TResult;
};

export type ErrorResponseEnvelope = {
  type: "response";
  id: string;
  status: "error";
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ResponseEnvelope<TResult = unknown> =
  | SuccessResponseEnvelope<TResult>
  | ErrorResponseEnvelope;

export type EventEnvelope<TEvent extends string = string, TPayload = unknown> = {
  type: "event";
  event: TEvent;
  sessionId?: string;
  taskId?: string;
  seq: number;
  timestamp: number;
  payload: TPayload;
};

export type HandshakeParams = z.infer<typeof HandshakeParamsSchema>;
export type HandshakeResult = z.infer<typeof HandshakeResultSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export type AgentMode = z.infer<typeof AgentModeSchema>;
export type StartTaskParams = z.infer<typeof StartTaskParamsSchema>;
export type StartTaskResult = z.infer<typeof StartTaskResultSchema>;
export type SendMessageParams = z.infer<typeof SendMessageParamsSchema>;
export type CancelTaskParams = z.infer<typeof CancelTaskParamsSchema>;
export type StopTaskParams = z.infer<typeof StopTaskParamsSchema>;
export type RespondToolApprovalParams = z.infer<typeof RespondToolApprovalParamsSchema>;
export type ListSessionsParams = z.infer<typeof ListSessionsParamsSchema>;
export type LoadSessionParams = z.infer<typeof LoadSessionParamsSchema>;
export type DeleteSessionParams = z.infer<typeof DeleteSessionParamsSchema>;
export type RuntimeStatusResult = z.infer<typeof RuntimeStatusResultSchema>;

export type ProviderContextLimits = z.infer<typeof ProviderContextLimitsSchema>;
export type ProviderReasoningSettings = z.infer<typeof ProviderReasoningSettingsSchema>;
export type AwsProviderSettings = z.infer<typeof AwsProviderSettingsSchema>;
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;
export type ConfigureProviderParams = z.infer<typeof ConfigureProviderParamsSchema>;
export type ConfigureProviderResult = z.infer<typeof ConfigureProviderResultSchema>;
export type GetProviderParams = z.infer<typeof GetProviderParamsSchema>;
export type DeleteProviderParams = z.infer<typeof DeleteProviderParamsSchema>;
export type SetActiveProviderParams = z.infer<typeof SetActiveProviderParamsSchema>;
export type ListProviderModelsParams = z.infer<typeof ListProviderModelsParamsSchema>;
export type ValidateProviderCredentialsParams = z.infer<typeof ValidateProviderCredentialsParamsSchema>;
export type TestProviderConnectivityParams = z.infer<typeof TestProviderConnectivityParamsSchema>;
export type ProviderConnectivityResult = z.infer<typeof ProviderConnectivityResultSchema>;
export type TokenUsagePayload = z.infer<typeof TokenUsagePayloadSchema>;
export type ToolApprovalRequestPayload = z.infer<typeof ToolApprovalRequestPayloadSchema>;
export type CursorPosition = z.infer<typeof CursorPositionSchema>;
export type ActiveDocumentContext = z.infer<typeof ActiveDocumentContextSchema>;
export type OpenDocumentContext = z.infer<typeof OpenDocumentContextSchema>;
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;
export type WorkspaceContextPayload = z.infer<typeof WorkspaceContextPayloadSchema>;
export type ResolveWorkspaceContextParams = z.infer<typeof ResolveWorkspaceContextParamsSchema>;
export type ResolveWorkspaceContextResult = z.infer<typeof ResolveWorkspaceContextResultSchema>;
