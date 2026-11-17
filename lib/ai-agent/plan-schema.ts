/**
 * Structured Task Plan Schemas and Types for Kairo AI Agent.
 *
 * Enforces structured planning over unstructured markdown representation.
 */
import { z } from "zod";

export const PlanStepStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;
export type TaskPlanStepStatus = PlanStepStatus;

export const PlanRiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type PlanRiskLevel = z.infer<typeof PlanRiskLevelSchema>;

export const ProposedChangeActionSchema = z.enum([
  "create",
  "modify",
  "delete",
  "rename",
]);
export type ProposedChangeAction = z.infer<typeof ProposedChangeActionSchema>;

export const TaskPlanStepSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  description: z.string(),
  files: z.array(z.string()).default([]),
  risk: PlanRiskLevelSchema.default("low"),
  status: PlanStepStatusSchema.default("pending"),
  requiresApproval: z.boolean().default(false),
  error: z.string().optional(),
  checkpointId: z.string().optional(),
});
export type TaskPlanStep = z.infer<typeof TaskPlanStepSchema>;

export const ProposedFileChangeSchema = z.object({
  path: z.string().min(1),
  action: ProposedChangeActionSchema,
  description: z.string().default(""),
});
export type ProposedFileChange = z.infer<typeof ProposedFileChangeSchema>;

export const PlanRiskItemSchema = z.object({
  description: z.string().min(1),
  mitigation: z.string().min(1),
  level: PlanRiskLevelSchema.default("medium"),
});
export type PlanRiskItem = z.infer<typeof PlanRiskItemSchema>;

export const PlanTestingStrategySchema = z.object({
  unitTests: z.array(z.string()).default([]),
  integrationTests: z.array(z.string()).optional(),
  manualChecks: z.array(z.string()).optional(),
  automatedCommands: z.array(z.string()).optional(),
});
export type PlanTestingStrategy = z.infer<typeof PlanTestingStrategySchema>;

export const StructuredTaskPlanSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  version: z.number().int().positive().default(1),
  objective: z.string().min(1),
  understanding: z.string().min(1),
  relevantFiles: z.array(z.string()).default([]),
  proposedChanges: z.array(ProposedFileChangeSchema).default([]),
  steps: z.array(TaskPlanStepSchema).min(1),
  dependencies: z.array(z.string()).default([]),
  risks: z.array(PlanRiskItemSchema).default([]),
  expectedOutput: z.string().min(1),
  testingStrategy: PlanTestingStrategySchema,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  isApproved: z.boolean().default(false),
  approvedAt: z.number().int().positive().optional(),
  approvedBy: z.string().optional(),
});
export type StructuredTaskPlan = z.infer<typeof StructuredTaskPlanSchema>;

export function createEmptyPlan(sessionId: string, objective: string): StructuredTaskPlan {
  const now = Date.now();
  return {
    id: `plan_${now}_${Math.random().toString(36).substring(2, 7)}`,
    sessionId,
    version: 1,
    objective,
    understanding: "",
    relevantFiles: [],
    proposedChanges: [],
    steps: [],
    dependencies: [],
    risks: [],
    expectedOutput: "",
    testingStrategy: {
      unitTests: [],
      integrationTests: [],
      manualChecks: [],
      automatedCommands: [],
    },
    createdAt: now,
    updatedAt: now,
    isApproved: false,
  };
}

export function validateTaskPlan(plan: unknown): {
  valid: boolean;
  data?: StructuredTaskPlan;
  errors?: string[];
} {
  const result = StructuredTaskPlanSchema.safeParse(plan);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}
