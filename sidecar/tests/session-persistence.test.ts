import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { SessionMetadataStore } from "../persistence/session-metadata-store";
import { RecoveryService } from "../persistence/recovery-service";
import { Logger } from "../utils/logger";
import { KairoSessionMetadata } from "../../lib/ai-agent/persistence-schema";
import { StructuredTaskPlan } from "../../lib/ai-agent/plan-schema";

describe("Session Persistence, History & Recovery", () => {
  const logger = new Logger("test-persistence");
  let tempStorageDir: string;
  let metadataStore: SessionMetadataStore;
  let recoveryService: RecoveryService;

  beforeEach(async () => {
    tempStorageDir = path.join(
      os.tmpdir(),
      `kairo-persistence-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );
    await fs.mkdir(tempStorageDir, { recursive: true });

    metadataStore = new SessionMetadataStore({
      baseDir: tempStorageDir,
      logger,
    });

    recoveryService = new RecoveryService({
      metadataStore,
      logger,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("Part A & E: Storage, Atomic Writes & Zero Secrets", () => {
    it("writes metadata atomically and reads it back", async () => {
      const meta: KairoSessionMetadata = {
        version: 1,
        conversationId: "sess-001",
        clineSessionId: "sess-001",
        taskId: "task-001",
        workspaceId: "ws-default",
        workspacePath: "/test/workspace",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Test Session",
        createdAt: 1000,
        updatedAt: 1000,
        lastActivityAt: 1000,
        status: "active",
        taskState: "executing",
        mode: "act",
        tags: ["feature"],
      };

      await metadataStore.saveMetadata(meta);

      const filePath = metadataStore.getMetadataFilePath("sess-001");
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const loaded = await metadataStore.getMetadata("sess-001");
      expect(loaded).toBeDefined();
      expect(loaded?.conversationId).toBe("sess-001");
      expect(loaded?.title).toBe("Test Session");
      expect(loaded?.taskState).toBe("executing");
    });

    it("rejects and prevents storing provider secrets or api keys", async () => {
      const dangerousMeta = {
        version: 1,
        conversationId: "sess-leak",
        clineSessionId: "sess-leak",
        taskId: "sess-leak",
        workspaceId: "default",
        workspacePath: "/ws",
        providerId: "openai",
        modelId: "gpt-4",
        title: "Secret Leak Attempt",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivityAt: Date.now(),
        status: "active" as const,
        taskState: "idle" as const,
        mode: "act" as const,
        tags: [],
        apiKey: "sk-secret-token-12345",
        secretToken: "super-secret",
      };

      await expect(
        metadataStore.saveMetadata(dangerousMeta as any)
      ).rejects.toThrow("contains forbidden secret key");
    });

    it("quarantines corrupted metadata files safely without throwing", async () => {
      const targetFile = metadataStore.getMetadataFilePath("sess-corrupted");
      await fs.writeFile(targetFile, "{ this is not valid json content !!!", "utf8");

      const result = await metadataStore.getMetadata("sess-corrupted");
      expect(result).toBeNull();

      // Ensure original corrupt file was quarantined
      const originalExists = await fs
        .access(targetFile)
        .then(() => true)
        .catch(() => false);
      expect(originalExists).toBe(false);

      const filesInDir = await fs.readdir(tempStorageDir);
      const quarantined = filesInDir.filter((f) => f.includes("sess-corrupted") && f.includes(".corrupt."));
      expect(quarantined.length).toBe(1);
    });

    it("migrates unversioned or legacy schema records to version 1", async () => {
      const targetFile = metadataStore.getMetadataFilePath("sess-legacy");
      const legacyRecord = {
        conversationId: "sess-legacy",
        clineSessionId: "sess-legacy",
        workspacePath: "/old/workspace",
        title: "Legacy Session",
        createdAt: 500,
        status: "active",
      };
      await fs.writeFile(targetFile, JSON.stringify(legacyRecord), "utf8");

      const migrated = await metadataStore.getMetadata("sess-legacy");
      expect(migrated).toBeDefined();
      expect(migrated?.version).toBe(1);
      expect(migrated?.providerId).toBe("anthropic");
      expect(migrated?.modelId).toBe("claude-3-7-sonnet-20250219");
      expect(migrated?.mode).toBe("act");
      expect(migrated?.taskState).toBe("idle");
    });
  });

  describe("Part B & C: History Operations (CRUD, Search, Rename)", () => {
    beforeEach(async () => {
      await metadataStore.saveMetadata({
        version: 1,
        conversationId: "sess-auth",
        clineSessionId: "sess-auth",
        taskId: "task-auth",
        workspaceId: "default",
        workspacePath: "/projects/webapp",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Implement Authentication Flow",
        createdAt: 1000,
        updatedAt: 2000,
        lastActivityAt: 2000,
        status: "active",
        taskState: "executing",
        mode: "act",
        tags: ["auth", "security"],
        summary: "OAuth2 authentication implementation",
      });

      await metadataStore.saveMetadata({
        version: 1,
        conversationId: "sess-db",
        clineSessionId: "sess-db",
        taskId: "task-db",
        workspaceId: "default",
        workspacePath: "/projects/database",
        providerId: "openai",
        modelId: "gpt-4o",
        title: "Optimize Postgres Queries",
        createdAt: 3000,
        updatedAt: 4000,
        lastActivityAt: 4000,
        status: "idle",
        taskState: "completed",
        mode: "plan",
        tags: ["sql", "performance"],
        summary: "Indexed queries and query plans",
      });
    });

    it("lists all metadata records sorted by lastActivityAt descending", async () => {
      const records = await metadataStore.listMetadata();
      expect(records).toHaveLength(2);
      expect(records[0].conversationId).toBe("sess-db");
      expect(records[1].conversationId).toBe("sess-auth");
    });

    it("renames a session custom title", async () => {
      await metadataStore.renameMetadata("sess-auth", "User Login & MFA Flow");

      const updated = await metadataStore.getMetadata("sess-auth");
      expect(updated?.customTitle).toBe("User Login & MFA Flow");
      expect(updated?.title).toBe("User Login & MFA Flow");
    });

    it("searches metadata records across title, summary, and tags", async () => {
      const authResults = await metadataStore.searchMetadata("OAuth2");
      expect(authResults).toHaveLength(1);
      expect(authResults[0].clineSessionId).toBe("sess-auth");

      const tagResults = await metadataStore.searchMetadata("performance");
      expect(tagResults).toHaveLength(1);
      expect(tagResults[0].clineSessionId).toBe("sess-db");

      const multiResults = await metadataStore.searchMetadata("projects");
      expect(multiResults).toHaveLength(2);
    });

    it("deletes metadata record cleanly", async () => {
      const deleted = await metadataStore.deleteMetadata("sess-auth");
      expect(deleted).toBe(true);

      const loaded = await metadataStore.getMetadata("sess-auth");
      expect(loaded).toBeNull();
    });
  });

  describe("Part D: Restart Recovery & Zero Automatic Re-Execution", () => {
    it("transitions active and executing sessions to interrupted upon restart", async () => {
      // Create session in 'executing' state with unresolved approval
      await metadataStore.saveMetadata({
        version: 1,
        conversationId: "sess-running",
        clineSessionId: "sess-running",
        taskId: "task-running",
        workspaceId: "default",
        workspacePath: "/projects/app",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Ongoing refactoring",
        createdAt: 1000,
        updatedAt: 2000,
        lastActivityAt: 2000,
        status: "active",
        taskState: "executing",
        mode: "act",
        tags: [],
        unresolvedApproval: {
          approvalId: "appr-001",
          toolName: "execute_command",
          action: "execute",
          risk: "destructive",
          target: "rm -rf build",
          requestedAt: 1900,
          status: "pending",
        },
      });

      // Also create an already completed session
      await metadataStore.saveMetadata({
        version: 1,
        conversationId: "sess-done",
        clineSessionId: "sess-done",
        taskId: "task-done",
        workspaceId: "default",
        workspacePath: "/projects/app",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Done refactoring",
        createdAt: 500,
        updatedAt: 1000,
        lastActivityAt: 1000,
        status: "idle",
        taskState: "completed",
        mode: "act",
        tags: [],
      });

      const report = await recoveryService.reconcileStartupState();
      expect(report.interruptedCount).toBe(1);
      expect(report.interruptedSessionIds).toContain("sess-running");

      const recoveredRunning = await metadataStore.getMetadata("sess-running");
      expect(recoveredRunning?.status).toBe("interrupted");
      expect(recoveredRunning?.taskState).toBe("interrupted");

      // Critical: unresolved approvals MUST NOT be re-executed automatically
      // They must be marked interrupted_requires_reauthorization
      expect(recoveredRunning?.unresolvedApproval).toBeDefined();
      expect(recoveredRunning?.unresolvedApproval?.status).toBe(
        "interrupted_requires_reauthorization"
      );

      // Completed session should remain completed
      const recoveredDone = await metadataStore.getMetadata("sess-done");
      expect(recoveredDone?.status).toBe("idle");
      expect(recoveredDone?.taskState).toBe("completed");
    });

    it("validates workspace association and detects mismatches", () => {
      const matchRes = recoveryService.validateWorkspaceAssociation(
        "/Users/test/kairo-app",
        "/Users/test/kairo-app"
      );
      expect(matchRes.matches).toBe(true);
      expect(matchRes.warning).toBeUndefined();

      const mismatchRes = recoveryService.validateWorkspaceAssociation(
        "/Users/test/other-app",
        "/Users/test/kairo-app"
      );
      expect(mismatchRes.matches).toBe(false);
      expect(mismatchRes.warning).toContain("belongs to workspace '/Users/test/other-app'");
    });

    it("preserves structured task plan across recovery", async () => {
      const plan: StructuredTaskPlan = {
        id: "plan-001",
        sessionId: "sess-plan",
        version: 1,
        objective: "Add search bar to dashboard",
        understanding: "User needs quick search across items",
        relevantFiles: ["src/dashboard.tsx"],
        proposedChanges: [
          {
            path: "src/dashboard.tsx",
            action: "modify",
            description: "Add SearchInput component",
          },
        ],
        steps: [
          {
            id: "step-1",
            index: 0,
            title: "Import SearchInput",
            description: "Add import statement",
            status: "completed",
            files: ["src/dashboard.tsx"],
            risk: "low",
            requiresApproval: false,
          },
          {
            id: "step-2",
            index: 1,
            title: "Bind search handler",
            description: "Connect to search service",
            status: "in_progress",
            files: ["src/dashboard.tsx"],
            risk: "low",
            requiresApproval: false,
          },
        ],
        dependencies: [],
        risks: [],
        expectedOutput: "Functional search bar",
        testingStrategy: {
          unitTests: ["dashboard.test.tsx"],
        },
        createdAt: 1000,
        updatedAt: 2000,
        isApproved: true,
      };

      await metadataStore.saveMetadata({
        version: 1,
        conversationId: "sess-plan",
        clineSessionId: "sess-plan",
        taskId: "task-plan",
        workspaceId: "default",
        workspacePath: "/projects/dashboard",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        title: "Search bar task",
        createdAt: 1000,
        updatedAt: 2000,
        lastActivityAt: 2000,
        status: "active",
        taskState: "executing",
        mode: "act",
        tags: [],
        plan,
      });

      await recoveryService.reconcileStartupState();

      const recovered = await metadataStore.getMetadata("sess-plan");
      expect(recovered?.taskState).toBe("interrupted");
      expect(recovered?.plan).toBeDefined();
      expect(recovered?.plan?.steps[0].status).toBe("completed");
      expect(recovered?.plan?.steps[1].status).toBe("in_progress");
    });
  });
});
