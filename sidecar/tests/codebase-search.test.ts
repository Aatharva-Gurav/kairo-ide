import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { CodebaseSearchEngine } from "../context/file-search";
import { ExclusionsManager } from "../context/exclusions";

describe("CodebaseSearchEngine", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let searchEngine: CodebaseSearchEngine;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // Setup mock directory structure
    await fs.mkdir(path.join(workspaceRoot, "src", "auth"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "src", "components"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "node_modules", "pkg"), { recursive: true });

    // File 1: auth service with functions and classes
    await fs.writeFile(
      path.join(workspaceRoot, "src", "auth", "auth-service.ts"),
      `export interface UserSession {
  userId: string;
  roles: string[];
}

export class AuthService {
  public async login(username: string): Promise<UserSession> {
    const token = "auth_jwt_sample";
    return { userId: username, roles: ["user"] };
  }
}

export function validateToken(token: string): boolean {
  return token.length > 0;
}
`
    );

    // File 2: UI button
    await fs.writeFile(
      path.join(workspaceRoot, "src", "components", "Button.tsx"),
      `export function Button(props: { label: string }) {
  return <button>{props.label}</button>;
}
`
    );

    // File 3: In ignored dir (should not be indexed/returned)
    await fs.writeFile(
      path.join(workspaceRoot, "node_modules", "pkg", "index.js"),
      `export function shouldNeverMatch() {}`
    );

    // File 4: Sensitive file (should not be indexed/returned)
    await fs.writeFile(
      path.join(workspaceRoot, ".env"),
      `SECRET_KEY=supersecret123`
    );

    const exclusions = new ExclusionsManager(workspaceRoot);
    searchEngine = new CodebaseSearchEngine(workspaceRoot, exclusions);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("File Name Search", () => {
    it("finds files by exact and substring match", async () => {
      const results = await searchEngine.searchFileName("auth");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relativePath).toBe("src/auth/auth-service.ts");
    });

    it("does not return files from ignored directories or sensitive files", async () => {
      const results = await searchEngine.searchFileName("pkg");
      expect(results.length).toBe(0);

      const envResults = await searchEngine.searchFileName(".env");
      expect(envResults.length).toBe(0);
    });

    it("returns empty array for empty search", async () => {
      const results = await searchEngine.searchFileName("");
      expect(results).toEqual([]);
    });
  });

  describe("Content Search", () => {
    it("finds matching lines with context snippets", async () => {
      const results = await searchEngine.searchContent("UserSession");
      expect(results.length).toBe(1);
      expect(results[0].relativePath).toBe("src/auth/auth-service.ts");
      expect(results[0].matches.length).toBeGreaterThan(0);
      expect(results[0].matches[0].lineContent).toContain("UserSession");
      expect(results[0].matches[0].lineNumber).toBe(1);
    });

    it("respects whole word matching", async () => {
      const whole = await searchEngine.searchContent("auth", { wholeWord: true });
      expect(whole.length).toBe(0);

      const partial = await searchEngine.searchContent("auth", { wholeWord: false });
      expect(partial.length).toBeGreaterThan(0);
    });

    it("never searches sensitive files or ignored dirs", async () => {
      const results = await searchEngine.searchContent("supersecret123");
      expect(results.length).toBe(0);

      const nodeModulesResult = await searchEngine.searchContent("shouldNeverMatch");
      expect(nodeModulesResult.length).toBe(0);
    });
  });

  describe("Symbol Search", () => {
    it("identifies functions, classes, and interfaces", async () => {
      const classRes = await searchEngine.searchSymbols("AuthService");
      expect(classRes.length).toBe(1);
      expect(classRes[0].symbolName).toBe("class AuthService");
      expect(classRes[0].relativePath).toBe("src/auth/auth-service.ts");

      const ifaceRes = await searchEngine.searchSymbols("UserSession");
      expect(ifaceRes.length).toBe(1);
      expect(ifaceRes[0].symbolName).toBe("interface UserSession");

      const fnRes = await searchEngine.searchSymbols("validateToken");
      expect(fnRes.length).toBe(1);
      expect(fnRes[0].symbolName).toBe("function validateToken");
    });
  });

  describe("Ranking", () => {
    it("boosts active file and open files in result list", async () => {
      const results = await searchEngine.searchContent("export");
      expect(results.length).toBe(2);

      const ranked = searchEngine.rankResults(
        results,
        path.join(workspaceRoot, "src", "components", "Button.tsx")
      );

      // Button.tsx was active file, so it should be ranked first despite fewer matches
      expect(ranked[0].relativePath).toBe("src/components/Button.tsx");
    });
  });
});
