import { describe, it, expect } from "vitest";
import {
  normalizePath,
  basename,
  dirname,
  joinPath,
  isDescendant,
  getFileExtension,
  validateFileName,
  formatFsError,
} from "./tauri-ipc";

describe("Tauri IPC & Path Utilities", () => {
  it("normalizes paths correctly across Windows and Unix separators", () => {
    expect(normalizePath("C:\\Users\\User\\Project")).toBe("C:/Users/User/Project");
    expect(normalizePath("C:\\Users\\User\\Project\\")).toBe("C:/Users/User/Project");
    expect(normalizePath("/home/user/project/")).toBe("/home/user/project");
    expect(normalizePath("C:/")).toBe("C:/");
  });

  it("extracts basename correctly", () => {
    expect(basename("C:/Users/User/Project")).toBe("Project");
    expect(basename("C:\\Users\\User\\file.tsx")).toBe("file.tsx");
    expect(basename("/var/log/app.log")).toBe("app.log");
  });

  it("extracts dirname correctly", () => {
    expect(dirname("C:/Users/User/Project")).toBe("C:/Users/User");
    expect(dirname("C:\\Users\\User\\Project\\src")).toBe("C:/Users/User/Project");
    expect(dirname("/var/log/app.log")).toBe("/var/log");
  });

  it("joins paths cleanly", () => {
    expect(joinPath("C:/Projects", "MyApp", "src")).toBe("C:/Projects/MyApp/src");
    expect(joinPath("C:\\Projects\\", "\\MyApp\\", "index.ts")).toBe("C:/Projects/MyApp/index.ts");
    expect(joinPath("/home/user", "repo", "main.rs")).toBe("/home/user/repo/main.rs");
  });

  it("detects descendant paths correctly", () => {
    expect(isDescendant("C:/Projects/App", "C:/Projects/App/src/components")).toBe(true);
    expect(isDescendant("C:/Projects/App", "C:/Projects/App")).toBe(true);
    expect(isDescendant("C:/Projects/App", "C:/Projects/OtherApp")).toBe(false);
    expect(isDescendant("C:/Projects/App", "C:/Projects")).toBe(false);
  });

  it("extracts file extension in lowercase", () => {
    expect(getFileExtension("button.tsx")).toBe("tsx");
    expect(getFileExtension("archive.TAR.GZ")).toBe("gz");
    expect(getFileExtension("Makefile")).toBe("");
    expect(getFileExtension(".gitignore")).toBe("");
  });

  it("validates filenames against illegal characters and reserved names", () => {
    expect(validateFileName("ValidFile.ts").valid).toBe(true);
    expect(validateFileName("my-folder_123").valid).toBe(true);

    expect(validateFileName("").valid).toBe(false);
    expect(validateFileName("   ").valid).toBe(false);
    expect(validateFileName("bad/name").valid).toBe(false);
    expect(validateFileName("bad\\name").valid).toBe(false);
    expect(validateFileName("file:name").valid).toBe(false);
    expect(validateFileName("file*name").valid).toBe(false);
    expect(validateFileName("file?name").valid).toBe(false);
    expect(validateFileName('file"name').valid).toBe(false);
    expect(validateFileName("file<name").valid).toBe(false);
    expect(validateFileName("file>name").valid).toBe(false);
    expect(validateFileName("file|name").valid).toBe(false);

    expect(validateFileName(".").valid).toBe(false);
    expect(validateFileName("..").valid).toBe(false);

    // Reserved Windows device names
    expect(validateFileName("con").valid).toBe(false);
    expect(validateFileName("prn.txt").valid).toBe(false);
    expect(validateFileName("nul").valid).toBe(false);
  });

  it("formats filesystem errors into human-friendly messages", () => {
    expect(formatFsError("File already exists at this path")).toContain("already exists");
    expect(formatFsError("Access is denied")).toContain("Access denied");
    expect(formatFsError("Cannot copy a directory into itself")).toContain("Cannot copy or move");
    expect(formatFsError("Path does not exist: /foo/bar")).toContain("could not be found");
  });
});

