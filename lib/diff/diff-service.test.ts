import { describe, it, expect } from "vitest";
import { DiffService } from "./diff-service";

describe("DiffService", () => {
  it("creates an add FileDiff for new files", () => {
    const diff = DiffService.createFileDiff({
      path: "src/new-file.ts",
      oldContent: null,
      newContent: "console.log('hello');",
    });

    expect(diff.type).toBe("add");
    expect(diff.oldContent).toBeNull();
    expect(diff.newContent).toBe("console.log('hello');");
    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.status).toBe("pending");
  });

  it("creates a delete FileDiff for removed files", () => {
    const diff = DiffService.createFileDiff({
      path: "src/old-file.ts",
      oldContent: "const dead = true;",
      newContent: null,
    });

    expect(diff.type).toBe("delete");
    expect(diff.oldContent).toBe("const dead = true;");
    expect(diff.newContent).toBeNull();
    expect(diff.status).toBe("pending");
  });

  it("creates a rename FileDiff when oldPath is different", () => {
    const diff = DiffService.createFileDiff({
      path: "src/renamed.ts",
      oldPath: "src/original.ts",
      oldContent: "const x = 1;",
      newContent: "const x = 2;",
    });

    expect(diff.type).toBe("rename");
    expect(diff.oldPath).toBe("src/original.ts");
    expect(diff.path).toBe("src/renamed.ts");
  });

  it("computes accurate unified diff hunks for modified files", () => {
    const oldCode = "const a = 1;\nconst b = 2;\nconst c = 3;";
    const newCode = "const a = 1;\nconst b = 99;\nconst c = 3;";

    const diff = DiffService.createFileDiff({
      path: "src/math.ts",
      oldContent: oldCode,
      newContent: newCode,
    });

    expect(diff.type).toBe("modify");
    expect(diff.hunks.length).toBeGreaterThan(0);
    const formatted = DiffService.formatUnifiedDiff(diff);
    expect(formatted).toContain("--- a/src/math.ts");
    expect(formatted).toContain("+++ b/src/math.ts");
    expect(formatted).toContain("-const b = 2;");
    expect(formatted).toContain("+const b = 99;");
  });

  it("detects conflict when active buffer is dirty and differs from base", () => {
    const conflict = DiffService.detectConflict({
      path: "src/app.ts",
      baseContent: "const version = 1;",
      currentBuffer: "const version = 1; // user typed this",
      currentDisk: "const version = 1;",
      isDirty: true,
    });

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("dirty_buffer");
    expect(conflict?.message).toContain("unsaved modifications");
  });

  it("detects conflict when disk was modified externally", () => {
    const conflict = DiffService.detectConflict({
      path: "src/app.ts",
      baseContent: "const version = 1;",
      currentBuffer: "const version = 1;",
      currentDisk: "const version = 2; // git pull changed this",
      isDirty: false,
    });

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("disk_mismatch");
    expect(conflict?.message).toContain("outside the current session");
  });

  it("detects conflict when file already exists for add operation", () => {
    const conflict = DiffService.detectConflict({
      path: "src/existing.ts",
      expectedToExist: false,
      fileExistsOnDisk: true,
    });

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("already_exists");
  });

  it("detects conflict when file was deleted externally for modify operation", () => {
    const conflict = DiffService.detectConflict({
      path: "src/missing.ts",
      expectedToExist: true,
      fileExistsOnDisk: false,
    });

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("deleted_target");
  });

  it("correctly aggregates multi-file diff status", () => {
    const file1 = DiffService.createFileDiff({
      path: "src/a.ts",
      oldContent: "a",
      newContent: "a2",
    });
    file1.status = "applied";

    const file2 = DiffService.createFileDiff({
      path: "src/b.ts",
      oldContent: "b",
      newContent: "b2",
    });
    file2.status = "failed";

    const multi = DiffService.createMultiFileDiff({
      files: [file1, file2],
      title: "Batch refactoring",
    });

    expect(multi.status).toBe("partial_failure");
    expect(multi.files.length).toBe(2);
  });

  it("applies hunks cleanly and returns updated content", () => {
    const original = "line1\nline2\nline3";
    const hunks = [
      {
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 1,
        lines: ["-line2", "+line2_replaced"],
      },
    ];

    const result = DiffService.applyHunks(original, hunks);
    expect(result).toBe("line1\nline2_replaced\nline3");
  });
});
