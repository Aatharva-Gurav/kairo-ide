/**
 * Finite State Machine for Kairo AI Agent Tasks.
 *
 * Enforces explicit lifecycle states, rejects invalid transitions, and tracks state history.
 */
import { TaskState, VALID_TRANSITIONS } from "./types";

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

export interface TaskStateTransitionRecord {
  from: TaskState;
  to: TaskState;
  timestamp: number;
  reason?: string;
  context?: Record<string, unknown>;
}

export type StateChangeListener = (record: TaskStateTransitionRecord) => void;

export class TaskStateMachine {
  private currentState: TaskState;
  private readonly sessionId: string;
  private readonly history: TaskStateTransitionRecord[] = [];
  private readonly listeners = new Set<StateChangeListener>();

  constructor(sessionId: string, initialState: TaskState = "idle") {
    this.sessionId = sessionId;
    this.currentState = initialState;
    this.history.push({
      from: "idle",
      to: initialState,
      timestamp: Date.now(),
      reason: "Initial state",
    });
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getState(): TaskState {
    return this.currentState;
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
    if (this.currentState === to) {
      return; // No-op for self-transition
    }

    if (!this.canTransition(to)) {
      throw new InvalidStateTransitionError(
        this.currentState,
        to,
        `Allowed targets from '${this.currentState}' are: [${(VALID_TRANSITIONS[this.currentState] || []).join(", ")}]`
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
        console.error("[TaskStateMachine] Error in state listener:", err);
      }
    }
  }

  public subscribe(listener: StateChangeListener): () => void {
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
    this.history.push({
      from: this.currentState,
      to: "idle",
      timestamp: Date.now(),
      reason: "Reset to idle",
    });
  }
}
