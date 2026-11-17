import { describe, it, expect, beforeEach } from "vitest";
import {
  FrontendTaskStateMachine,
  InvalidStateTransitionError,
} from "./task-state-machine";
import { createEmptyPlan } from "@/lib/ai-agent/plan-schema";

describe("FrontendTaskStateMachine", () => {
  let fsm: FrontendTaskStateMachine;

  beforeEach(() => {
    fsm = new FrontendTaskStateMachine("idle");
  });

  it("initializes with idle state and initial history", () => {
    expect(fsm.getState()).toBe("idle");
    expect(fsm.getActivePlan()).toBeNull();
    const history = fsm.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].to).toBe("idle");
  });

  it("supports valid state progression: idle -> planning -> awaiting_plan_approval -> executing", () => {
    fsm.transition("planning", "User prompt");
    expect(fsm.getState()).toBe("planning");
    expect(fsm.isPlanPhase()).toBe(true);

    fsm.transition("awaiting_plan_approval", "Plan ready");
    expect(fsm.getState()).toBe("awaiting_plan_approval");
    expect(fsm.isPlanPhase()).toBe(true);

    fsm.transition("executing", "User approved");
    expect(fsm.getState()).toBe("executing");
    expect(fsm.isActPhase()).toBe(true);
  });

  it("rejects illegal state transitions with typed error", () => {
    expect(() => fsm.transition("completed")).toThrow(InvalidStateTransitionError);
    expect(() => fsm.transition("verifying")).toThrow(InvalidStateTransitionError);
  });

  it("allows setting valid structured plans and rejects invalid ones", () => {
    const validPlan = createEmptyPlan("test-session", "Test Objective");
    validPlan.understanding = "Understood request";
    validPlan.expectedOutput = "Working feature";
    validPlan.steps = [
      {
        id: "s1",
        index: 0,
        title: "Step 1",
        description: "Initial step",
        files: [],
        risk: "low",
        status: "pending",
        requiresApproval: false,
      },
    ];

    fsm.setPlan(validPlan);
    expect(fsm.getActivePlan()?.objective).toBe("Test Objective");

    expect(() => {
      fsm.setPlan({} as unknown as Parameters<typeof fsm.setPlan>[0]);
    }).toThrow();
  });

  it("notifies subscribers upon state transition", () => {
    const transitions: string[] = [];
    fsm.subscribe((rec) => transitions.push(rec.to));

    fsm.transition("planning");
    fsm.transition("awaiting_plan_approval");

    expect(transitions).toEqual(["planning", "awaiting_plan_approval"]);
  });

  it("resets state machine back to idle cleanly", () => {
    fsm.transition("planning");
    fsm.reset();

    expect(fsm.getState()).toBe("idle");
    const history = fsm.getHistory();
    expect(history.some((h) => h.to === "cancelled")).toBe(true);
  });
});
