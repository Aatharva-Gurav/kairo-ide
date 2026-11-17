/**
 * Session Persistence & History Schemas for Kairo AI Agent.
 *
 * Defines Kairo-specific metadata structures stored separately from
 * Cline Core's canonical SQLite session records and transcripts.
 */
import { z } from "zod";
import { TaskStateSchema } from "./transport-schema";
import { StructuredTaskPlanSchema } from "./plan-schema";

export const UnresolvedApprovalStateSchema = z.object({
  approvalId: z.string().min(1),
  toolName: z.string().min(1),
  action: z.string().min(1),
  risk: z.string().min(1),
  target: z.string().optional(),
  requestedAt: z.number().int().positive(),
  status: z.enum(["pending", "interrupted_requires_reauthorization"]),
});
export type UnresolvedApprovalState = z.infer<typeof UnresolvedApprovalStateSchema>;

export const KairoSessionMetadataSchema = z.object({
  version: z.number().int().positive().default(1),
  conversationId: z.string().min(1),
  clineSessionId: z.string().min(1),
  taskId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspacePath: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  title: z.string().min(1),
  customTitle: z.string().optional(),
  summary: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  lastActivityAt: z.number().int().positive(),
  status: z.enum([
    "active",
    "idle",
    "interrupted",
    "completed",
    "failed",
    "cancelled",
  ]),
  taskState: TaskStateSchema.default("idle"),
  mode: z.enum(["plan", "act"]).default("act"),
  plan: StructuredTaskPlanSchema.optional(),
  unresolvedApproval: UnresolvedApprovalStateSchema.optional(),
  interruptedAt: z.number().int().positive().optional(),
  interruptedReason: z.string().optional(),
  totalCost: z.number().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
});
export type KairoSessionMetadata = z.infer<typeof KairoSessionMetadataSchema>;

export const SessionSearchResultSchema = z.object({
  sessionId: z.string(),
  conversationId: z.string(),
  title: z.string(),
  snippet: stringMatcherSnippet(),
  matchField: z.enum(["title", "plan_objective", "plan_understanding", "file_path", "message"]),
  workspacePath: z.string(),
  lastActivityAt: z.number(),
  status: z.string(),
});
export type SessionSearchResult = z.infer<typeof SessionSearchResultSchema>;

function stringMatcherSnippet() {
  return z.string().default("");
}

export const SessionSummaryItemSchema = z.object({
  sessionId: z.string(),
  conversationId: z.string(),
  title: z.string(),
  customTitle: z.string().optional(),
  workspacePath: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
  status: z.string(),
  taskState: TaskStateSchema,
  mode: z.enum(["plan", "act"]),
  hasPlan: z.boolean(),
  isInterrupted: z.boolean(),
  totalCost: z.number().optional(),
});
export type SessionSummaryItem = z.infer<typeof SessionSummaryItemSchema>;
