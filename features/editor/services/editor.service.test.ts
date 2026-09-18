import { describe, it, expect, vi } from "vitest";
import { EditorService } from "./editor.service";
import * as tauriIpc from "@/lib/tauri-ipc";

describe("EditorService", () => {
  it("loads a valid text file properly", async () => {
    vi.spyOn(tauriIpc, "readFileContent").mockResolvedValueOnce({
      content: "export const x = 10;",
      isBinary: false,
      size: 20,
      readonly: false,
    });

    const doc = await EditorService.loadDocument("C:/projects/kairo/src/index.ts");
    expect(doc.title).toBe("index.ts");
    expect(doc.language).toBe("typescript");
    expect(doc.content).toBe("export const x = 10;");
    expect(doc.savedContent).toBe("export const x = 10;");
    expect(doc.isDirty).toBe(false);
    expect(doc.isBinary).toBe(false);
  });

  it("handles binary files safely without loading binary content into editor", async () => {
    vi.spyOn(tauriIpc, "readFileContent").mockResolvedValueOnce({
      content: "",
      isBinary: true,
      size: 1024,
      readonly: false,
    });

    const doc = await EditorService.loadDocument("C:/projects/kairo/assets/logo.png");
    expect(doc.title).toBe("logo.png");
    expect(doc.isBinary).toBe(true);
    expect(doc.content).toBe("");
  });

  it("handles file read errors gracefully without throwing unhandled exceptions", async () => {
    vi.spyOn(tauriIpc, "readFileContent").mockRejectedValueOnce(
      new Error("Access denied.")
    );

    const doc = await EditorService.loadDocument("C:/projects/kairo/secret.key");
    expect(doc.error).toBe("Access denied.");
    expect(doc.content).toBe("");
  });

  it("saves all dirty documents concurrently and reports isolated failures", async () => {
    const writeSpy = vi.spyOn(tauriIpc, "writeFileContent").mockImplementation(async (path) => {
      if (path.includes("fail.ts")) {
        throw new Error("Permission denied.");
      }
    });

    const testDocs = [
      {
        id: "C:/a.ts",
        path: "C:/a.ts",
        title: "a.ts",
        language: "typescript",
        content: "new a",
        savedContent: "old a",
        isDirty: true,
      },
      {
        id: "C:/fail.ts",
        path: "C:/fail.ts",
        title: "fail.ts",
        language: "typescript",
        content: "new fail",
        savedContent: "old fail",
        isDirty: true,
      },
      {
        id: "C:/clean.ts",
        path: "C:/clean.ts",
        title: "clean.ts",
        language: "typescript",
        content: "clean",
        savedContent: "clean",
        isDirty: false,
      },
    ];

    const result = await EditorService.saveAllDocuments(testDocs);
    expect(result.saved).toContain("C:/a.ts");
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].path).toBe("C:/fail.ts");
    expect(writeSpy).toHaveBeenCalledTimes(2);
  });
});

