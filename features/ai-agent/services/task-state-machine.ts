/**
 * Frontend Task State Machine.
 *
 * Provides reactive state tracking and transition validation for the Next.js UI.
 */
import {
  TaskState,
  StructuredTaskPlan,
  validateTaskPlan,
} from "@/lib/ai-agent";

export class InvalidStateTransitionError extends Error {
  public readonly from: TaskState;
  public readonly to: TaskState;

  constructor(from: TaskState, to: TaskState, reason?: string) {
    super(
      `Invalid state transition from '${from}' to '${to}'${reason ? `: ${reason}` : "."}`
    );
    this.name = "InvalidStateTransitionError";
    this.from = from;
    this.to = to;
  }
}

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

export interface TaskStateTransitionRecord {
  from: TaskState;
  to: TaskState;
  timestamp: number;
  reason?: string;
  context?: Record<string, unknown>;
}

export class FrontendTaskStateMachine {
  private currentState: TaskState;
  private activePlan: StructuredTaskPlan | null = null;
  private readonly history: TaskStateTransitionRecord[] = [];
  private readonly listeners = new Set<(record: TaskStateTransitionRecord) => void>();

  constructor(initialState: TaskState = "idle") {
    this.currentState = initialState;
    this.history.push({
      from: "idle",
      to: initialState,
      timestamp: Date.now(),
      reason: "Initial state",
    });
  }

  public getState(): TaskState {
    return this.currentState;
  }

  public getActivePlan(): StructuredTaskPlan | null {
    return this.activePlan;
  }

  public setPlan(plan: StructuredTaskPlan): void {
    const val = validateTaskPlan(plan);
    if (!val.valid) {
      throw new Error(`Invalid plan: ${val.errors?.join(", ")}`);
    }
    this.activePlan = val.data || plan;
  }

  public canTransition(to: TaskState): boolean {
    const validTargets = VALID_TRANSITIONS[this.currentState];
    return Array.isArray(validTargets) && validTargets.includes(to);
  }

  public transition(
    to: TaskState,
    reason?: string,
    context?: Record<string, unknown>
  ): void {
    if (this.currentState === to) return;

    if (!this.canTransition(to)) {
      throw new InvalidStateTransitionError(
        this.currentState,
        to,
        `Allowed transitions from '${this.currentState}' are: [${(VALID_TRANSITIONS[this.currentState] || []).join(", ")}]`
      );
    }

    const previousState = this.currentState;
    this.currentState = to;

    const record: TaskStateTransitionRecord = {
      from: previousState,
      to,
      timestamp: Date.now(),
      reason,
      context,
    };
    this.history.push(record);

    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (err) {
        console.error("[FrontendTaskStateMachine] Error in listener:", err);
      }
    }
  }

  public subscribe(listener: (record: TaskStateTransitionRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getHistory(): TaskStateTransitionRecord[] {
    return [...this.history];
  }

  public isTerminal(): boolean {
    return (
      this.currentState === "completed" ||
      this.currentState === "failed" ||
      this.currentState === "cancelled"
    );
  }

  public isPlanPhase(): boolean {
    return (
      this.currentState === "planning" ||
      this.currentState === "awaiting_plan_approval"
    );
  }

  public isActPhase(): boolean {
    return (
      this.currentState === "executing" ||
      this.currentState === "awaiting_tool_approval" ||
      this.currentState === "verifying"
    );
  }

  public reset(): void {
    if (!this.isTerminal() && this.currentState !== "idle") {
      this.transition("cancelled", "State machine reset");
    }
    this.currentState = "idle";
    this.activePlan = null;
    this.history.push({
      from: this.currentState,
      to: "idle",
      timestamp: Date.now(),
      reason: "Reset to idle",
    });
  }
}
