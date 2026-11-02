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
