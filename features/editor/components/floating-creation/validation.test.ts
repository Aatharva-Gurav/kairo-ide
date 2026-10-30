import { describe, it, expect } from "vitest";
import { validateCreationInput } from "./validation";

describe("validateCreationInput", () => {
  const workspaceRoot = "C:/Projects/kairo-ide";

  describe("File Creation Validation", () => {
    it("accepts standard valid filenames", () => {
      const validNames = [
        "index.tsx",
        "styles.module.css",
        "README.md",
        "package.json",
        "route.config.ts",
      ];
      for (const name of validNames) {
        const res = validateCreationInput(name, "file", workspaceRoot, workspaceRoot);
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it("accepts valid dotfiles", () => {
      const dotfiles = [
        ".gitignore",
        ".env",
        ".env.local",
        ".eslintrc.json",
        ".prettierrc",
      ];
      for (const name of dotfiles) {
        const res = validateCreationInput(name, "file", workspaceRoot, workspaceRoot);
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it("rejects empty and whitespace-only filenames", () => {
      expect(validateCreationInput("", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
      expect(validateCreationInput("   ", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
    });

    it("rejects path separators in filenames", () => {
      expect(validateCreationInput("foo/bar.ts", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
      expect(validateCreationInput("foo\\bar.ts", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
    });

    it("rejects dot and double-dot traversal", () => {
      expect(validateCreationInput(".", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
      expect(validateCreationInput("..", "file", workspaceRoot, workspaceRoot).valid).toBe(false);
    });

    it("rejects reserved system filenames", () => {
      const reserved = ["con", "prn", "aux", "nul", "com1", "lpt1"];
      for (const r of reserved) {
        const res = validateCreationInput(r, "file", workspaceRoot, workspaceRoot);
        expect(res.valid).toBe(false);
        expect(res.error).toContain("reserved system name");
      }
    });

    it("rejects OS illegal characters", () => {
      const illegal = ["file*name.ts", 'file"name.ts', "file<name.ts", "file>name.ts", "file|name.ts", "file:name.ts", "file?name.ts"];
      for (const name of illegal) {
        const res = validateCreationInput(name, "file", workspaceRoot, workspaceRoot);
        expect(res.valid).toBe(false);
      }
    });
  });

  describe("Folder Creation Validation", () => {
    it("accepts valid folder names", () => {
      const validFolders = ["components", "ui", "sub-folder", "my_module", ".github"];
      for (const name of validFolders) {
        const res = validateCreationInput(name, "folder", workspaceRoot, workspaceRoot);
        expect(res.valid).toBe(true);
        expect(res.error).toBeUndefined();
      }
    });

    it("rejects empty folder names", () => {
      expect(validateCreationInput("", "folder", workspaceRoot, workspaceRoot).valid).toBe(false);
    });

    it("rejects slashes in folder names", () => {
      expect(validateCreationInput("parent/child", "folder", workspaceRoot, workspaceRoot).valid).toBe(false);
    });
  });

  describe("Workspace Boundary & Path Traversal Guards", () => {
    it("accepts nested target directories within workspace", () => {
      const targetDir = "C:/Projects/kairo-ide/src/components";
      const res = validateCreationInput("button.tsx", "file", targetDir, workspaceRoot);
      expect(res.valid).toBe(true);
    });

    it("rejects target directory outside workspace", () => {
      const outsideDir = "C:/OtherProjects/outside";
      const res = validateCreationInput("file.ts", "file", outsideDir, workspaceRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("outside the active workspace");
    });
  });
});

