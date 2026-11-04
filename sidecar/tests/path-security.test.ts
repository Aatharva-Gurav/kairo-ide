import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { PathValidator } from "../security/path-validator";

describe("PathValidator Security & Sandboxing", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let validator: PathValidator;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `kairo-path-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // Create some test files and folders inside workspace
    await fs.writeFile(path.join(workspaceRoot, "index.ts"), "console.log('hello');");
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "app.ts"), "export const app = 1;");

    validator = new PathValidator();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("permits valid existing and non-existing paths inside workspace", () => {
    // 1. Existing file
    const res1 = validator.validate("index.ts", workspaceRoot);
    expect(res1.valid).toBe(true);
    expect(res1.relativePath).toBe("index.ts");

    // 2. Existing nested file
    const res2 = validator.validate("src/app.ts", workspaceRoot);
    expect(res2.valid).toBe(true);
    expect(res2.relativePath).toBe("src/app.ts");

    // 3. New file to be created in existing folder
    const res3 = validator.validate("src/new-component.tsx", workspaceRoot);
    expect(res3.valid).toBe(true);
    expect(res3.relativePath).toBe("src/new-component.tsx");

    // 4. New file in new sub-folder to be created
    const res4 = validator.validate("src/deep/nested/feature.ts", workspaceRoot);
    expect(res4.valid).toBe(true);
    expect(res4.relativePath).toBe("src/deep/nested/feature.ts");
  });

  it("blocks ../ path traversal attempts", () => {
    const maliciousPaths = [
      "../outside.txt",
      "../../outside.txt",
      "src/../../outside.txt",
      "src/deep/../../../../escape.txt",
      "..\\outside.txt",
      "..\\..\\outside.txt",
    ];

    for (const p of maliciousPaths) {
      const res = validator.validate(p, workspaceRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  it("blocks absolute path escapes outside workspace", () => {
    const isWindows = process.platform === "win32";
    const escapePaths = isWindows
      ? ["C:\\Windows\\System32\\cmd.exe", "C:\\Users\\Public\\secret.txt", "C:\\temp"]
      : ["/etc/passwd", "/var/log/syslog", "/tmp/escape.txt"];

    for (const p of escapePaths) {
      // Ensure escape path is not coincidentally tempDir
      if (!p.startsWith(workspaceRoot)) {
        const res = validator.validate(p, workspaceRoot);
        expect(res.valid).toBe(false);
        expect(res.error).toBeDefined();
      }
    }
  });

  it("detects and blocks symlinks pointing outside workspace", async () => {
    // Create target file outside workspace
    const outsideFile = path.join(tempDir, "outside-secret.txt");
    await fs.writeFile(outsideFile, "SECRET_DATA");

    const symlinkPath = path.join(workspaceRoot, "symlink-outside");
    try {
      await fs.symlink(outsideFile, symlinkPath);
    } catch {
      // If OS user lacks SeCreateSymbolicLinkPrivilege on Windows, skip symlink creation
      return;
    }

    const res = validator.validate("symlink-outside", workspaceRoot);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Path traversal violation");
  });

  it("blocks Windows UNC network paths", () => {
    const uncPaths = [
      "\\\\attacker-server\\share\\file.txt",
      "//remote-host/share/data.json",
      "\\\\?\\UNC\\192.168.1.100\\c$\\payload.exe",
    ];

    for (const p of uncPaths) {
      const res = validator.validate(p, workspaceRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("UNC");
    }
  });

  it("blocks Windows drive changes", () => {
    if (process.platform !== "win32") return;

    // Determine current drive letter of workspace
    const currentDrive = workspaceRoot.slice(0, 1).toUpperCase();
    const otherDrive = currentDrive === "C" ? "D" : "C";

    const res = validator.validate(`${otherDrive}:\\some\\other\\path.txt`, workspaceRoot);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Drive change detected");
  });

  it("handles case normalization safely on case-insensitive filesystems", () => {
    if (process.platform === "win32" || process.platform === "darwin") {
      // Case-varied existing file
      const upperPath = "INDEX.TS";
      const res = validator.validate(upperPath, workspaceRoot);
      expect(res.valid).toBe(true);

      // Traversal with case-variations
      const resTraversal = validator.validate("SRC/../../OUTSIDE.txt", workspaceRoot);
      expect(resTraversal.valid).toBe(false);
    }
  });

  it("blocks dangerous path encodings and null-byte injection", () => {
    const dangerousPaths = [
      "src/file%2e%2e%2fescape.txt",
      "index.ts\0.exe",
      "data%00.txt",
      "src/foo%2f..%2fbar",
    ];

    for (const p of dangerousPaths) {
      const res = validator.validate(p, workspaceRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  it("blocks Windows alternate data streams", () => {
    if (process.platform !== "win32") return;

    const res = validator.validate("index.ts:hidden_stream", workspaceRoot);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("alternate data stream");
  });

  it("blocks sensitive credential files (.env, .git, id_rsa) by default", () => {
    const sensitiveFiles = [
      ".env",
      ".env.local",
      ".env.production",
      ".git/config",
      ".git/HEAD",
      ".ssh/id_rsa",
      "id_rsa",
      "id_ed25519",
      "server.key",
      "cert.pem",
      ".aws/credentials",
    ];

    for (const s of sensitiveFiles) {
      const res = validator.validate(s, workspaceRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("prohibited by security policy");
    }
  });

  it("blocks targeting Kairo internal data directory (~/.kairo)", () => {
    const kairoPath = path.join(os.homedir(), ".kairo", "security", "credentials.vault");
    const res = validator.validate(kairoPath, workspaceRoot);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Kairo internal storage");
  });
});
