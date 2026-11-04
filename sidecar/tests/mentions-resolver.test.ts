import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { MentionsResolver } from "../context/mentions-resolver";
import { ExclusionsManager } from "../context/exclusions";
import type { WorkspaceContextPayload } from "../../lib/ai-agent/types";

describe("MentionsResolver", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let resolver: MentionsResolver;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-mentions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // Create disk files
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "math.ts"),
      "export const add = (a: number, b: number) => a + b;"
    );
    await fs.writeFile(
      path.join(workspaceRoot, ".env"),
      "API_KEY=shhh_secret"
    );

    const exclusions = new ExclusionsManager(workspaceRoot);
    resolver = new MentionsResolver(workspaceRoot, exclusions);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Mention Parsing", () => {
    it("parses diverse mention formats correctly", () => {
      const prompt =
        "Please inspect @file:src/math.ts and @folder(src) with @selection and check @problems. Also see @terminal and @codebase:auth";
      const parsed = resolver.parseMentions(prompt);

      expect(parsed.length).toBe(6);
      expect(parsed[0].type).toBe("@file");
      expect(parsed[0].query).toBe("src/math.ts");

      expect(parsed[1].type).toBe("@folder");
      expect(parsed[1].query).toBe("src");

      expect(parsed[2].type).toBe("@selection");

      expect(parsed[3].type).toBe("@problems");

      expect(parsed[4].type).toBe("@terminal");

      expect(parsed[5].type).toBe("@codebase");
      expect(parsed[5].query).toBe("auth");
    });

    it("parses quoted file names with spaces", () => {
      const prompt = `Can you check @file:"src/my complex file.ts"?`;
      const parsed = resolver.parseMentions(prompt);

      expect(parsed.length).toBe(1);
      expect(parsed[0].type).toBe("@file");
      expect(parsed[0].query).toBe("src/my complex file.ts");
    });
  });

  describe("Resolving @file", () => {
    it("resolves from disk when file exists", async () => {
      const parsed = resolver.parseMentions("@file:src/math.ts");
      const items = await resolver.resolveMentions(parsed);

      expect(items.length).toBe(1);
      expect(items[0].filePath).toBe("src/math.ts");
      expect(items[0].content).toContain("export const add");
    });

    it("prioritizes unsaved dirty in-memory editor buffer over disk content", async () => {
      const context: WorkspaceContextPayload = {
        workspaceRoot,
        activeDocument: {
          path: path.join(workspaceRoot, "src", "math.ts"),
          language: "typescript",
          content: "export const add = (a: number, b: number) => a + b + 1; // DIRTY UNSAVED",
          isDirty: true,
        },
      };

      const parsed = resolver.parseMentions("@file:src/math.ts");
      const items = await resolver.resolveMentions(parsed, { context });

      expect(items.length).toBe(1);
      expect(items[0].title).toContain("Unsaved");
      expect(items[0].content).toContain("// DIRTY UNSAVED");
    });

    it("strictly blocks sensitive files from leaking content", async () => {
      const parsed = resolver.parseMentions("@file:.env");
      const items = await resolver.resolveMentions(parsed);

      expect(items.length).toBe(1);
      expect(items[0].content).toContain("Security Warning");
      expect(items[0].content).not.toContain("shhh_secret");
    });

    it("gracefully handles non-existent file", async () => {
      const parsed = resolver.parseMentions("@file:src/does-not-exist.ts");
      const items = await resolver.resolveMentions(parsed);

      expect(items.length).toBe(1);
      expect(items[0].title).toContain("NOT FOUND");
    });
  });

  describe("Resolving @selection", () => {
    it("extracts active selection and cursor coordinates", async () => {
      const context: WorkspaceContextPayload = {
        workspaceRoot,
        activeDocument: {
          path: path.join(workspaceRoot, "src", "math.ts"),
          language: "typescript",
          cursorPosition: { line: 1, column: 15 },
          selection: "a + b",
          isDirty: false,
        },
      };

      const parsed = resolver.parseMentions("@selection");
      const items = await resolver.resolveMentions(parsed, { context });

      expect(items.length).toBe(1);
      expect(items[0].content).toContain("a + b");
      expect(items[0].content).toContain("Cursor at L1:C15");
    });
  });

  describe("Resolving @terminal", () => {
    it("attaches recent terminal output", async () => {
      const context: WorkspaceContextPayload = {
        workspaceRoot,
        terminalOutput: "npm run build\n[vite] built in 42ms\nDone.",
      };

      const parsed = resolver.parseMentions("@terminal");
      const items = await resolver.resolveMentions(parsed, { context });

      expect(items.length).toBe(1);
      expect(items[0].content).toContain("[vite] built in 42ms");
    });
  });

  describe("Resolving @problems", () => {
    it("groups diagnostics and formats error severities", async () => {
      const context: WorkspaceContextPayload = {
        workspaceRoot,
        diagnostics: [
          {
            filePath: path.join(workspaceRoot, "src", "math.ts"),
            line: 1,
            column: 14,
            message: "Type 'string' is not assignable to type 'number'",
            severity: "error",
            source: "ts",
          },
        ],
      };

      const parsed = resolver.parseMentions("@problems");
      const items = await resolver.resolveMentions(parsed, { context });

      expect(items.length).toBe(1);
      expect(items[0].content).toContain("[ERROR] L1:C14");
      expect(items[0].content).toContain("Type 'string' is not assignable");
    });
  });
});
