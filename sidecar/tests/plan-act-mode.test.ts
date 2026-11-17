/**
 * Exhaustive Stage 11 Plan Mode & Act Mode Test Suite (Bun test).
 *
 * Verifies:
 * - Part A: Hardened read-only backend Plan Mode enforcement (writes & commands blocked).
 * - Part B: Structured plan schema validation and creation.
 * - Part C: 10-state task finite state machine and illegal transition rejection.
 * - Part D: Checkpoint coordinator snapshotting and Git-independent rollback.
 * - Part E: Execution engine step tracking, operation-level approvals, and stop-on-failure.
 * - Part F: Verification engine integrity gating (never claims success on failure).
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Logger } from "../utils/logger";
import { PermissionManager } from "../permissions/permission-manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PathValidator } from "../security/path-validator";
import { CommandGuard } from "../security/command-guard";
import { AuditLogger } from "../security/audit-logger";
import {
  TaskStateMachine,
  InvalidStateTransitionError,
} from "../state-machine";
import {
  StructuredTaskPlan,
  createEmptyPlan,
  validateTaskPlan,
} from "../../lib/ai-agent/plan-schema";
import {
  CheckpointCoordinator,
  VerificationEngine,
  TaskExecutionEngine,
} from "../planning";

describe("Stage 11: Production-Grade Plan Mode and Act Mode", () => {
  let tempDir: string;
  let logger: Logger;
  let approvalCoordinator: ApprovalCoordinator;
  let permissionManager: PermissionManager;
  let pathValidator: PathValidator;
  let commandGuard: CommandGuard;
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairo-stage11-test-"));
    logger = new Logger("test-stage11");
    approvalCoordinator = new ApprovalCoordinator(logger);
    pathValidator = new PathValidator();
    commandGuard = new CommandGuard();
    auditLogger = new AuditLogger({ logFilePath: path.join(tempDir, "audit.jsonl") });

    permissionManager = new PermissionManager({
      logger,
      approvalCoordinator,
      pathValidator,
      commandGuard,
      auditLogger,
      sessionContextProvider: {
        getSessionWorkspace: () => tempDir,
        getSessionMode: (id) => (id.includes("plan") ? "plan" : "act"),
      },
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // =========================================================================
  // Part A: Plan Mode Backend Read-Only Enforcement
  // =========================================================================
  describe("Part A: Backend-Enforced Plan Mode", () => {
    it("strictly blocks mutating file operations in Plan Mode", async () => {
      const mutatingTools = [
        { tool: "write_to_file", input: { path: path.join(tempDir, "test.txt"), content: "data" } },
        { tool: "create_file", input: { path: path.join(tempDir, "new.txt") } },
        { tool: "delete_file", input: { path: path.join(tempDir, "old.txt") } },
        { tool: "rename_file", input: { oldPath: "a.txt", newPath: "b.txt" } },
        { tool: "move_file", input: { sourcePath: "a.txt", destinationPath: "b.txt" } },
      ];

      for (const { tool, input } of mutatingTools) {
        const result = await permissionManager.handleToolApprovalRequest({
          sessionId: "session-plan-1",
          agentId: "agent-1",
          conversationId: "conv-1",
          iteration: 1,
          toolCallId: `call-${tool}`,
          toolName: tool,
          input,
          policy: { enabled: true },
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toContain("prohibited in Plan Mode");
      }
    });

    it("strictly blocks arbitrary shell commands in Plan Mode", async () => {
      const shellCommands = ["echo hello", "npm test", "ls -la", "dir", "cat file.txt"];

      for (const cmd of shellCommands) {
        const result = await permissionManager.handleToolApprovalRequest({
          sessionId: "session-plan-1",
          agentId: "agent-1",
          conversationId: "conv-1",
          iteration: 1,
          toolCallId: `call-cmd-${cmd}`,
          toolName: "execute_command",
          input: { command: cmd },
          policy: { enabled: true },
        });

        expect(result.approved).toBe(false);
        expect(result.reason).toContain("prohibited in Plan Mode");
      }
    });

    it("strictly blocks dependency installations in Plan Mode", async () => {
      const result = await permissionManager.handleToolApprovalRequest({
        sessionId: "session-plan-1",
        agentId: "agent-1",
        conversationId: "conv-1",
        iteration: 1,
        toolCallId: "call-npm-install",
        toolName: "run_commands",
        input: { command: "npm install lodash" },
        policy: { enabled: true },
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain("prohibited in Plan Mode");
    });

    it("permits safe read-only inspection operations in Plan Mode", async () => {
      const filePath = path.join(tempDir, "readable.txt");
      await fs.writeFile(filePath, "sample content", "utf8");

      const readRes = await permissionManager.handleToolApprovalRequest({
        sessionId: "session-plan-1",
        agentId: "agent-1",
        conversationId: "conv-1",
        iteration: 1,
        toolCallId: "call-read",
        toolName: "read_file",
        input: { path: filePath },
        policy: { enabled: true },
      });
      expect(readRes.approved).toBe(true);

      const listRes = await permissionManager.handleToolApprovalRequest({
        sessionId: "session-plan-1",
        agentId: "agent-1",
        conversationId: "conv-1",
        iteration: 1,
        toolCallId: "call-list",
        toolName: "list_directory",
        input: { path: tempDir },
        policy: { enabled: true },
      });
      expect(listRes.approved).toBe(true);
    });
  });

  // =========================================================================
  // Part B: Structured Task Plan
  // =========================================================================
  describe("Part B: Structured Plan Validation", () => {
    it("creates and validates a structured plan correctly", () => {
      const plan = createEmptyPlan("sess-1", "Implement auth middleware");
      expect(plan.id).toBeDefined();
      expect(plan.sessionId).toBe("sess-1");
      expect(plan.objective).toBe("Implement auth middleware");

      plan.understanding = "Add JWT token verification to protected routes";
      plan.relevantFiles = ["src/auth.ts", "src/routes.ts"];
      plan.proposedChanges = [
        { path: "src/auth.ts", action: "create", description: "JWT validation logic" },
      ];
      plan.steps = [
        {
          id: "step-1",
          index: 0,
          title: "Create auth helper",
          description: "Implement token parser",
          files: ["src/auth.ts"],
          risk: "low",
          status: "pending",
          requiresApproval: false,
        },
      ];
      plan.expectedOutput = "Working authentication middleware with unit tests";
      plan.testingStrategy.automatedCommands = ["npm test src/auth.test.ts"];

      const validation = validateTaskPlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.data?.objective).toBe("Implement auth middleware");
    });

    it("rejects an invalid plan missing mandatory fields", () => {
      const invalidPlan = {
        sessionId: "sess-1",
        objective: "", // invalid empty string
      };

      const validation = validateTaskPlan(invalidPlan);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors?.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Part C: Task State Machine (10 States)
  // =========================================================================
  describe("Part C: Task State Machine Lifecycle", () => {
    it("manages happy path transitions: idle -> planning -> awaiting_plan_approval -> executing -> verifying -> completed", () => {
      const fsm = new TaskStateMachine("session-lifecycle-1", "idle");
      expect(fsm.getState()).toBe("idle");

      fsm.transition("planning", "User requested plan");
      expect(fsm.getState()).toBe("planning");
      expect(fsm.isPlanPhase()).toBe(true);

      fsm.transition("awaiting_plan_approval", "Agent submitted structured plan");
      expect(fsm.getState()).toBe("awaiting_plan_approval");

      fsm.transition("executing", "User approved plan");
      expect(fsm.getState()).toBe("executing");
      expect(fsm.isActPhase()).toBe(true);

      fsm.transition("verifying", "Steps completed, verifying changes");
      expect(fsm.getState()).toBe("verifying");

      fsm.transition("completed", "Verification passed");
      expect(fsm.getState()).toBe("completed");
      expect(fsm.isTerminal()).toBe(true);
    });

    it("throws InvalidStateTransitionError on illegal transitions", () => {
      const fsm = new TaskStateMachine("session-fsm-reject", "idle");

      // Cannot jump from idle directly to completed
      expect(() => fsm.transition("completed")).toThrow(InvalidStateTransitionError);

      fsm.transition("planning");
      // Cannot jump from planning directly to executing (must await approval first)
      expect(() => fsm.transition("executing")).toThrow(InvalidStateTransitionError);
    });

    it("supports plan rejection and adjustment transitions", () => {
      const fsm = new TaskStateMachine("session-adj", "awaiting_plan_approval");

      // Adjustment: transitions back to planning
      fsm.transition("planning", "User requested plan revisions");
      expect(fsm.getState()).toBe("planning");

      fsm.transition("awaiting_plan_approval", "Agent resubmitted plan");
      // Full rejection: transitions to cancelled
      fsm.transition("cancelled", "User rejected task");
      expect(fsm.getState()).toBe("cancelled");
      expect(fsm.isTerminal()).toBe(true);
    });

    it("tracks state transition history correctly", () => {
      const fsm = new TaskStateMachine("session-history", "idle");
      fsm.transition("planning", "Start planning");
      fsm.transition("awaiting_plan_approval", "Submit plan");

      const history = fsm.getHistory();
      expect(history.length).toBe(3); // initial + 2 transitions
      expect(history[1].to).toBe("planning");
      expect(history[2].to).toBe("awaiting_plan_approval");
    });
  });

  // =========================================================================
  // Part D: Checkpoint Coordinator & Rollback
  // =========================================================================
  describe("Part D: Checkpoint Coordinator & Safe Rollback", () => {
    it("creates snapshots and restores previous content safely", async () => {
      const coordinator = new CheckpointCoordinator(logger);
      const testFile = path.join(tempDir, "checkpoint-target.ts");
      await fs.writeFile(testFile, "original code", "utf8");

      // 1. Create checkpoint
      const cp = await coordinator.createCheckpoint("sess-cp-1", "before edit", [testFile]);
      expect(cp.id).toBeDefined();
      expect(cp.files[testFile].content).toBe("original code");
      expect(cp.files[testFile].exists).toBe(true);

      // 2. Modify file
      await fs.writeFile(testFile, "corrupted agent code", "utf8");

      // 3. Rollback
      const restoreRes = await coordinator.restoreCheckpoint(cp.id);
      expect(restoreRes.success).toBe(true);
      expect(restoreRes.restoredFiles).toContain(testFile);

      // 4. Verify file content restored
      const restoredContent = await fs.readFile(testFile, "utf8");
      expect(restoredContent).toBe("original code");
    });

    it("deletes newly created files upon checkpoint restoration", async () => {
      const coordinator = new CheckpointCoordinator(logger);
      const newFile = path.join(tempDir, "should-be-deleted.ts");

      // Create checkpoint before file exists
      const cp = await coordinator.createCheckpoint("sess-cp-2", "before create", [newFile]);
      expect(cp.files[newFile].exists).toBe(false);

      // Simulate file creation by agent
      await fs.writeFile(newFile, "new code", "utf8");
      expect(await fs.stat(newFile).catch(() => null)).not.toBeNull();

      // Rollback: should remove the file
      const restoreRes = await coordinator.restoreCheckpoint(cp.id);
      expect(restoreRes.success).toBe(true);

      const existsAfter = await fs.stat(newFile).catch(() => null);
      expect(existsAfter).toBeNull();
    });
  });

  // =========================================================================
  // Part E: Task Execution Engine
  // =========================================================================
  describe("Part E: Task Execution Engine", () => {
    it("executes steps sequentially and creates pre-modification checkpoints", async () => {
      const fsm = new TaskStateMachine("session-exec-1", "awaiting_plan_approval");
      const targetFile = path.join(tempDir, "feature.ts");
      await fs.writeFile(targetFile, "// initial content", "utf8");

      const plan = createEmptyPlan("session-exec-1", "Add feature");
      plan.proposedChanges = [
        { path: targetFile, action: "modify", description: "Update feature" },
      ];
      plan.steps = [
        {
          id: "step-1",
          index: 0,
          title: "Write feature code",
          description: "Modify file",
          files: [targetFile],
          risk: "medium",
          status: "pending",
          requiresApproval: false,
        },
      ];

      const progressRecords: any[] = [];
      const engine = new TaskExecutionEngine({
        sessionId: "session-exec-1",
        workspaceRoot: tempDir,
        stateMachine: fsm,
        logger,
        stepExecutor: async (step) => {
          await fs.writeFile(targetFile, "// modified content", "utf8");
          return { success: true };
        },
        onStepProgress: (progress) => progressRecords.push(progress),
      });

      const execResult = await engine.executePlan(plan);
      expect(execResult.completed).toBe(true);
      expect(fsm.getState()).toBe("completed");

      // Verify checkpoints were captured
      const checkpoints = engine.getCheckpointCoordinator().listCheckpoints("session-exec-1");
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0].files[targetFile].content).toBe("// initial content");

      // Check step status
      expect(engine.getStepStatus("step-1")).toBe("completed");
    });

    it("halts immediately on step failure and marks task as failed", async () => {
      const fsm = new TaskStateMachine("session-fail-1", "awaiting_plan_approval");

      const plan = createEmptyPlan("session-fail-1", "Failing task");
      plan.steps = [
        {
          id: "step-1",
          index: 0,
          title: "Step that fails",
          description: "Throws error",
          files: [],
          risk: "low",
          status: "pending",
          requiresApproval: false,
        },
        {
          id: "step-2",
          index: 1,
          title: "Step that should never run",
          description: "Never runs",
          files: [],
          risk: "low",
          status: "pending",
          requiresApproval: false,
        },
      ];

      let step2Ran = false;
      const engine = new TaskExecutionEngine({
        sessionId: "session-fail-1",
        workspaceRoot: tempDir,
        stateMachine: fsm,
        logger,
        stepExecutor: async (step) => {
          if (step.id === "step-1") {
            return { success: false, error: "Compilation error" };
          }
          step2Ran = true;
          return { success: true };
        },
      });

      const execResult = await engine.executePlan(plan);
      expect(execResult.completed).toBe(false);
      expect(execResult.error).toContain("Compilation error");
      expect(fsm.getState()).toBe("failed");
      expect(step2Ran).toBe(false);
      expect(engine.getStepStatus("step-2")).toBe("pending");
    });

    it("prevents duplicate execution of completed steps on resumption", async () => {
      const fsm = new TaskStateMachine("session-resume-1", "awaiting_plan_approval");

      const plan = createEmptyPlan("session-resume-1", "Resumed task");
      plan.steps = [
        {
          id: "step-1",
          index: 0,
          title: "Already done step",
          description: "Done",
          files: [],
          risk: "low",
          status: "completed",
          requiresApproval: false,
        },
        {
          id: "step-2",
          index: 1,
          title: "Next step",
          description: "Executes now",
          files: [],
          risk: "low",
          status: "pending",
          requiresApproval: false,
        },
      ];

      let step1ExecutionCount = 0;
      let step2ExecutionCount = 0;

      const engine = new TaskExecutionEngine({
        sessionId: "session-resume-1",
        workspaceRoot: tempDir,
        stateMachine: fsm,
        logger,
        stepExecutor: async (step) => {
          if (step.id === "step-1") step1ExecutionCount++;
          if (step.id === "step-2") step2ExecutionCount++;
          return { success: true };
        },
      });

      const execResult = await engine.executePlan(plan);
      expect(execResult.completed).toBe(true);
      expect(step1ExecutionCount).toBe(0); // skipped because already completed!
      expect(step2ExecutionCount).toBe(1);
    });

    it("enforces operation-level approval and transitions through awaiting_tool_approval", async () => {
      const fsm = new TaskStateMachine("session-tool-appr", "executing");
      const statesObserved: string[] = [];
      fsm.subscribe((rec) => statesObserved.push(rec.to));

      const engine = new TaskExecutionEngine({
        sessionId: "session-tool-appr",
        workspaceRoot: tempDir,
        stateMachine: fsm,
        logger,
        permissionManager,
      });

      let pendingApprovalId: string | null = null;
      approvalCoordinator.setNotifier((payload) => {
        pendingApprovalId = payload.approvalId;
      });

      // Directly call requestToolApproval with moderate risk
      const approvalPromise = engine.requestToolApproval(
        {
          id: "s1",
          index: 0,
          title: "Edit code",
          description: "",
          files: [],
          risk: "medium",
          status: "in_progress",
          requiresApproval: true,
        },
        "modify_file",
        "moderate",
        path.join(tempDir, "file.ts")
      );

      // Give event loop a tick to register approval request
      await new Promise((r) => setTimeout(r, 20));

      expect(pendingApprovalId).not.toBeNull();
      approvalCoordinator.resolveApproval(pendingApprovalId!, true);

      const approved = await approvalPromise;
      expect(approved).toBe(true);
      expect(statesObserved).toContain("awaiting_tool_approval");
      expect(fsm.getState()).toBe("executing");
    });
  });

  // =========================================================================
  // Part F: Verification Engine
  // =========================================================================
  describe("Part F: Verification Engine Integrity Gating", () => {
    it("reports verification failure if modified files are missing", async () => {
      const engine = new VerificationEngine({ logger });
      const plan = createEmptyPlan("sess-verif-1", "Verify files");
      plan.proposedChanges = [
        { path: path.join(tempDir, "missing.txt"), action: "create", description: "Must exist" },
      ];

      const report = await engine.verifyPlan({
        plan,
        workspaceRoot: tempDir,
        runAutomatedTests: false,
      });

      expect(report.passed).toBe(false);
      expect(report.unresolvedProblems.length).toBeGreaterThan(0);
      expect(report.unresolvedProblems[0]).toContain("missing");
    });

    it("reports verification failure if a JSON file has syntax errors", async () => {
      const engine = new VerificationEngine({ logger });
      const brokenJsonPath = path.join(tempDir, "config.json");
      await fs.writeFile(brokenJsonPath, "{ broken json content: ", "utf8");

      const plan = createEmptyPlan("sess-verif-2", "Verify json");
      plan.proposedChanges = [
        { path: brokenJsonPath, action: "modify", description: "JSON config" },
      ];

      const report = await engine.verifyPlan({
        plan,
        workspaceRoot: tempDir,
        runAutomatedTests: false,
      });

      expect(report.passed).toBe(false);
      expect(report.diagnosticsErrors.length).toBeGreaterThan(0);
      expect(report.unresolvedProblems.some((p) => p.includes("syntax error"))).toBe(true);
    });

    it("passes verification when all files exist, are readable, and have valid syntax", async () => {
      const engine = new VerificationEngine({ logger });
      const validJsonPath = path.join(tempDir, "valid.json");
      await fs.writeFile(validJsonPath, JSON.stringify({ ok: true }), "utf8");

      const plan = createEmptyPlan("sess-verif-3", "Verify valid");
      plan.proposedChanges = [
        { path: validJsonPath, action: "create", description: "Valid JSON" },
      ];

      const report = await engine.verifyPlan({
        plan,
        workspaceRoot: tempDir,
        runAutomatedTests: false,
      });

      expect(report.passed).toBe(true);
      expect(report.unresolvedProblems.length).toBe(0);
      expect(report.inspectedFiles.length).toBe(1);
    });
  });
});
