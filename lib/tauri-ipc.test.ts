import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import {
  normalizePath,
  basename,
  dirname,
  joinPath,
  isDescendant,
  getFileExtension,
  validateFileName,
  formatFsError,
  parseFsErrorCode,
  formatBytes,
  invokeCommand,
} from "./tauri-ipc";

describe("Tauri IPC & Path Utilities", () => {
  it("normalizes paths correctly across Windows and Unix separators", () => {
    expect(normalizePath("C:\\Users\\User\\Project")).toBe("C:/Users/User/Project");
    expect(normalizePath("C:\\Users\\User\\Project\\")).toBe("C:/Users/User/Project");
    expect(normalizePath("/home/user/project/")).toBe("/home/user/project");
    expect(normalizePath("C:/")).toBe("C:/");
    expect(normalizePath("/C:/Users/User/Project")).toBe("C:/Users/User/Project");
    expect(normalizePath("file:///C:/Users/User/Project")).toBe("C:/Users/User/Project");
    expect(normalizePath("c:/users/user/project")).toBe("C:/users/user/project");
    expect(normalizePath("C:/Users/Aatharva%20Gurav/Project")).toBe("C:/Users/Aatharva Gurav/Project");
    expect(normalizePath("C:/Projects/App/../OtherApp")).toBe("C:/Projects/OtherApp");
    expect(normalizePath("/var/log/../lib/./app.log")).toBe("/var/lib/app.log");
  });

  it("prevents directory traversal in descendant checks", () => {
    expect(isDescendant("C:/Projects/App", "C:/Projects/App/../OtherApp")).toBe(false);
    expect(isDescendant("C:/Projects/App", "C:/Projects/App/src/../components")).toBe(true);
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
    expect(formatFsError("Access denied: '.env' is a protected sensitive file or credential path.")).toContain("protected by Kairo security policy");
    expect(parseFsErrorCode("Access denied: path is outside the authorized workspace boundary")).toBe("OUTSIDE_WORKSPACE");
    expect(parseFsErrorCode("Access denied: symlinks and junctions are not permitted")).toBe("SYMLINK_BLOCKED");
    expect(parseFsErrorCode("Access denied: no active workspace is open.")).toBe("NO_ACTIVE_WORKSPACE");
  });

  it("formats bytes into human-readable string units", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  describe("invokeCommand Tauri vs Browser VFS Isolation (SEC-08)", () => {
    const globalWithWindow = globalThis as unknown as { window?: unknown };
    let originalWindow: unknown;

    beforeEach(() => {
      originalWindow = globalWithWindow.window;
      mockInvoke.mockReset();
    });

    afterEach(() => {
      if (originalWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = originalWindow;
      }
    });

    it("throws a clear error instead of falling back to browser VFS in Tauri mode", async () => {
      globalWithWindow.window = { __TAURI_INTERNALS__: {} };

      mockInvoke.mockRejectedValueOnce(new Error("command fs_read_file not found"));
      await expect(
        invokeCommand<string>("fs_read_file", { path: "C:/workspace/README.md" })
      ).rejects.toThrow(/command fs_read_file not found/);

      mockInvoke.mockRejectedValueOnce(new Error("__TAURI_INTERNALS__ invoke error"));
      await expect(
        invokeCommand<boolean>("fs_exists", { path: "C:/workspace/README.md" })
      ).rejects.toThrow(/__TAURI_INTERNALS__/);
    });

    it("uses browser VFS fallback only when not running inside Tauri", async () => {
      delete globalWithWindow.window;

      const exists = await invokeCommand<boolean>("fs_exists", {
        path: "/workspace/nonexistent-sec08-check.txt",
      });
      expect(exists).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });
});

