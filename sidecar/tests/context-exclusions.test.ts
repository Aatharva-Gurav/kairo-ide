import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ExclusionsManager, MAX_FILE_SIZE_BYTES } from "../context/exclusions";

describe("ExclusionsManager & Sensitive File Protection", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let exclusions: ExclusionsManager;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-exclusions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // Create a mock .gitignore
    await fs.writeFile(
      path.join(workspaceRoot, ".gitignore"),
      "temp-build/\n*.log\ncustom-secret.txt\n"
    );

    exclusions = new ExclusionsManager(workspaceRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("Sensitive File Patterns", () => {
    it("detects .env and its variants as sensitive", () => {
      expect(exclusions.isSensitive(".env")).toBe(true);
      expect(exclusions.isSensitive(".env.local")).toBe(true);
      expect(exclusions.isSensitive(".env.production")).toBe(true);
      expect(exclusions.isSensitive("backend/.env")).toBe(true);
      expect(exclusions.isSensitive("packages/app/.env.test")).toBe(true);
    });

    it("detects private keys and certificates as sensitive", () => {
      expect(exclusions.isSensitive("server.key")).toBe(true);
      expect(exclusions.isSensitive("cert.pem")).toBe(true);
      expect(exclusions.isSensitive("bundle.pfx")).toBe(true);
      expect(exclusions.isSensitive("id_rsa")).toBe(true);
      expect(exclusions.isSensitive("id_ed25519")).toBe(true);
      expect(exclusions.isSensitive("id_rsa.pub")).toBe(true);
    });

    it("detects cloud credentials and auth tokens as sensitive", () => {
      expect(exclusions.isSensitive("credentials.json")).toBe(true);
      expect(exclusions.isSensitive("token.json")).toBe(true);
      expect(exclusions.isSensitive("auth_token.txt")).toBe(true);
      expect(exclusions.isSensitive(".aws/credentials")).toBe(true);
      expect(exclusions.isSensitive(".azure/tokens")).toBe(true);
    });

    it("detects internal .kairo configuration as sensitive", () => {
      expect(exclusions.isSensitive(".kairo/security/vault.enc")).toBe(true);
      expect(exclusions.isSensitive(".kairo/credentials.vault")).toBe(true);
    });

    it("does not flag ordinary code and config files as sensitive", () => {
      expect(exclusions.isSensitive("src/index.ts")).toBe(false);
      expect(exclusions.isSensitive("package.json")).toBe(false);
      expect(exclusions.isSensitive("tsconfig.json")).toBe(false);
      expect(exclusions.isSensitive("README.md")).toBe(false);
      expect(exclusions.isSensitive("src/components/Header.tsx")).toBe(false);
    });
  });

  describe("Ignored Directories", () => {
    it("identifies heavy build and package directories", () => {
      expect(exclusions.isIgnoredDirectory("node_modules")).toBe(true);
      expect(exclusions.isIgnoredDirectory(".git")).toBe(true);
      expect(exclusions.isIgnoredDirectory(".next")).toBe(true);
      expect(exclusions.isIgnoredDirectory("dist")).toBe(true);
      expect(exclusions.isIgnoredDirectory("build")).toBe(true);
      expect(exclusions.isIgnoredDirectory(".turbo")).toBe(true);
      expect(exclusions.isIgnoredDirectory("target")).toBe(true);
      expect(exclusions.isIgnoredDirectory("coverage")).toBe(true);
      expect(exclusions.isIgnoredDirectory(".kairo")).toBe(true);
    });

    it("allows standard source directories", () => {
      expect(exclusions.isIgnoredDirectory("src")).toBe(false);
      expect(exclusions.isIgnoredDirectory("components")).toBe(false);
      expect(exclusions.isIgnoredDirectory("lib")).toBe(false);
      expect(exclusions.isIgnoredDirectory("features")).toBe(false);
      expect(exclusions.isIgnoredDirectory("public")).toBe(false);
    });
  });

  describe("Binary Files", () => {
    it("flags binary media, archives, and binaries by extension", () => {
      expect(exclusions.isBinaryFile("logo.png")).toBe(true);
      expect(exclusions.isBinaryFile("sound.mp3")).toBe(true);
      expect(exclusions.isBinaryFile("archive.zip")).toBe(true);
      expect(exclusions.isBinaryFile("native.dll")).toBe(true);
      expect(exclusions.isBinaryFile("binary.wasm")).toBe(true);
      expect(exclusions.isBinaryFile("document.pdf")).toBe(true);
      expect(exclusions.isBinaryFile("database.sqlite")).toBe(true);
    });

    it("flags binary buffers containing null bytes", () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // "Hel\0o"
      expect(exclusions.isBinaryFile("unknown.dat", buffer)).toBe(true);
    });

    it("allows plain text buffers", () => {
      const buffer = Buffer.from("console.log('hello world');", "utf8");
      expect(exclusions.isBinaryFile("app.ts", buffer)).toBe(false);
    });
  });

  describe("Lockfiles", () => {
    it("identifies standard package manager lockfiles", () => {
      expect(exclusions.isLockfile("package-lock.json")).toBe(true);
      expect(exclusions.isLockfile("yarn.lock")).toBe(true);
      expect(exclusions.isLockfile("pnpm-lock.yaml")).toBe(true);
      expect(exclusions.isLockfile("bun.lockb")).toBe(true);
      expect(exclusions.isLockfile("cargo.lock")).toBe(true);
    });
  });

  describe("Oversized Files", () => {
    it("excludes files exceeding MAX_FILE_SIZE_BYTES (1MB)", () => {
      expect(exclusions.isOversized(MAX_FILE_SIZE_BYTES + 1)).toBe(true);
      expect(exclusions.isOversized(MAX_FILE_SIZE_BYTES)).toBe(false);
      expect(exclusions.isOversized(50000)).toBe(false);
    });
  });

  describe("Comprehensive shouldExclude", () => {
    it("excludes sensitive files with reason", () => {
      const res = exclusions.shouldExclude(".env");
      expect(res.exclude).toBe(true);
      expect(res.reason).toContain("Sensitive credential");
    });

    it("excludes files inside ignored directories", () => {
      const res = exclusions.shouldExclude("node_modules/react/index.js");
      expect(res.exclude).toBe(true);
      expect(res.reason).toContain("node_modules");
    });

    it("excludes binary files", () => {
      const res = exclusions.shouldExclude("assets/logo.png");
      expect(res.exclude).toBe(true);
      expect(res.reason).toContain("Binary");
    });

    it("excludes files matched in .gitignore", () => {
      const res = exclusions.shouldExclude("custom-secret.txt");
      expect(res.exclude).toBe(true);
      expect(res.reason).toContain("Matched ignore rule");
    });

    it("allows standard source code files", () => {
      const res = exclusions.shouldExclude("src/utils/math.ts");
      expect(res.exclude).toBe(false);
    });
  });
});
