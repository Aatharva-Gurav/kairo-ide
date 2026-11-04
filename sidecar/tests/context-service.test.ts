import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ContextService } from "../context/context-service";
import { ConnectionManager } from "../server/connection";
import { Logger } from "../utils/logger";
import type { WorkspaceContextPayload } from "../../lib/ai-agent/types";

describe("ContextService & Runtime Context Integration", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let contextService: ContextService;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-context-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // 1. Create project instructions
    await fs.writeFile(
      path.join(workspaceRoot, "AGENTS.md"),
      "# Agent Instructions\nAlways use TypeScript strict mode."
    );

    // 2. Create sample files
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export function run() { console.log('running'); }"
    );

    contextService = new ContextService(workspaceRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("loads project instructions automatically from AGENTS.md", async () => {
    const assembled = await contextService.resolveContext({
      workspaceRoot,
      prompt: "Hello agent",
    });

    expect(assembled.items.some((i) => i.section === "instructions")).toBe(true);
    expect(assembled.formattedPrompt).toContain("Always use TypeScript strict mode.");
  });

  it("integrates dirty active document over disk file", async () => {
    const payload: WorkspaceContextPayload = {
      workspaceRoot,
      activeDocument: {
        path: path.join(workspaceRoot, "src", "index.ts"),
        language: "typescript",
        content: "export function run() { console.log('DIRTY UNSAVED'); }",
        isDirty: true,
        cursorPosition: { line: 1, column: 10 },
      },
      diagnostics: [
        {
          filePath: path.join(workspaceRoot, "src", "index.ts"),
          line: 1,
          column: 5,
          message: "Unused variable",
          severity: "warning",
        },
      ],
    };

    const assembled = await contextService.resolveContext({
      workspaceRoot,
      prompt: "Refactor this function",
      context: payload,
    });

    expect(assembled.formattedPrompt).toContain("DIRTY UNSAVED");
    expect(assembled.formattedPrompt).toContain("Unsaved In-Memory Editor Buffer");
    expect(assembled.formattedPrompt).toContain("Unused variable");
    expect(assembled.includedFiles).toContain("src/index.ts");
  });

  it("resolves inline mentions within prompt", async () => {
    const payload: WorkspaceContextPayload = {
      workspaceRoot,
      activeDocument: {
        path: path.join(workspaceRoot, "src", "index.ts"),
        language: "typescript",
        selection: "console.log('running');",
        isDirty: false,
      },
    };

    const assembled = await contextService.resolveContext({
      workspaceRoot,
      prompt: "Check @selection in @file:src/index.ts",
      context: payload,
    });

    expect(assembled.formattedPrompt).toContain("console.log('running');");
    expect(assembled.items.some((i) => i.title.includes("Selection"))).toBe(true);
  });

  it("handles explicit codebase search query", async () => {
    const assembled = await contextService.resolveContext({
      workspaceRoot,
      prompt: "Find running calls",
      searchQuery: "running",
    });

    expect(assembled.formattedPrompt).toContain('Search: "running"');
    expect(assembled.formattedPrompt).toContain("console.log('running');");
  });

  it("handles resolve_workspace_context RPC command via ConnectionManager", async () => {
    const logger = new Logger("test", "error");
    const connectionManager = new ConnectionManager(logger, {
      contextService,
    });

    let sentMessage: string | null = null;
    const mockWs: any = {
      data: { id: "test-socket", authenticated: true, isAlive: true, lastPingAt: Date.now(), connectedAt: Date.now() },
      send: (data: string) => {
        sentMessage = data;
      },
    };

    connectionManager.register(mockWs);

    const commandFrame = {
      type: "command",
      id: "req-context-1",
      name: "resolve_workspace_context",
      params: {
        workspaceRoot,
        query: "export",
        context: {
          workspaceRoot,
          activeDocument: {
            path: path.join(workspaceRoot, "src", "index.ts"),
            language: "typescript",
            content: "export function run() {}",
            isDirty: false,
          },
        },
      },
    };

    await connectionManager.handleMessage(mockWs, JSON.stringify(commandFrame));

    expect(sentMessage).not.toBeNull();
    const parsed = JSON.parse(sentMessage!);
    expect(parsed.type).toBe("response");
    expect(parsed.id).toBe("req-context-1");
    expect(parsed.status).toBe("ok");
    expect(parsed.result.formattedContext).toContain("Active Editor: src/index.ts");
    expect(parsed.result.includedFiles).toContain("src/index.ts");
    expect(parsed.result.estimatedTokens).toBeGreaterThan(0);
  });
});
