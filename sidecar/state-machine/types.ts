/**
 * State Machine Types and Valid Transition Mapping for Kairo AI Agent Tasks.
 */
import { TaskState } from "../../lib/ai-agent/transport-schema";

export type { TaskState };

export const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  idle: ["planning", "executing"],
  planning: ["awaiting_plan_approval", "failed", "cancelled", "interrupted"],
  awaiting_plan_approval: ["executing", "planning", "cancelled", "interrupted"],
  executing: ["awaiting_tool_approval", "verifying", "failed", "cancelled", "interrupted"],
  awaiting_tool_approval: ["executing", "failed", "cancelled", "interrupted"],
  verifying: ["completed", "executing", "failed", "cancelled", "interrupted"],
  completed: ["idle", "planning"],
  failed: ["idle", "planning"],
  cancelled: ["idle", "planning"],
  interrupted: ["planning", "executing", "cancelled", "idle"],
};
