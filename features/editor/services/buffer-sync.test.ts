import { describe, it, expect, vi, beforeEach } from "vitest";
import { BufferSyncService } from "./buffer-sync.service";
import { ModelService } from "./model.service";
import { EditorService } from "./editor.service";
import * as tauriIpc from "@/lib/tauri-ipc";

describe("BufferSyncService & 10-Step Protocol", () => {
  // In-memory virtual disk for tests
  const virtualDisk = new Map<string, string>();

  beforeEach(() => {
    ModelService.disposeAll();
    virtualDisk.clear();

    // Mock readFileContent & writeFileContent to use virtual disk
    vi.spyOn(tauriIpc, "readFileContent").mockImplementation(async (pathStr: string) => {
      const norm = tauriIpc.normalizePath(pathStr);
      if (!virtualDisk.has(norm)) {
        throw new Error(`File not found: ${norm}`);
      }
      const content = virtualDisk.get(norm)!;
      return {
        content,
        isBinary: false,
        size: content.length,
        readonly: false,
      };
    });

    vi.spyOn(tauriIpc, "writeFileContent").mockImplementation(async (pathStr: string, content: string) => {
      const norm = tauriIpc.normalizePath(pathStr);
      virtualDisk.set(norm, content);
    });

    vi.spyOn(EditorService, "saveDocument").mockImplementation(async (pathStr: string, content: string) => {
      const norm = tauriIpc.normalizePath(pathStr);
      virtualDisk.set(norm, content);
    });
  });

  const createMockMonaco = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const models = new Map<string, any>();

    return {
      Uri: {
        file: (p: string) => ({
          path: p,
          fsPath: p,
          toString: () => `file://${p}`,
        }),
      },
      editor: {
        getModel: (uri: { toString: () => string }) => {
          return models.get(uri.toString()) || null;
        },
        createModel: (content: string, language: string, uri: { toString: () => string }) => {
          let currentContent = content;
          let isDisposed = false;
          let versionId = 1;
          const undoStack: string[] = [];

          const mockModel = {
            getValue: () => currentContent,
            setValue: (val: string) => {
              currentContent = val;
              versionId++;
            },
            getFullModelRange: () => ({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 10,
              endColumn: 1,
            }),
            pushEditOperations: (
              _beforeCursorState: unknown,
              editOperations: Array<{ range: unknown; text: string }>
            ) => {
              undoStack.push(currentContent);
              if (editOperations.length > 0) {
                currentContent = editOperations[0].text;
              }
              versionId++;
            },
            undo: () => {
              if (undoStack.length > 0) {
                currentContent = undoStack.pop()!;
                versionId++;
              }
            },
            getVersionId: () => versionId,
            getLanguageId: () => language,
            isDisposed: () => isDisposed,
            dispose: () => {
              isDisposed = true;
              models.delete(uri.toString());
            },
            uri,
          };
          models.set(uri.toString(), mockModel);
          return mockModel;
        },
      },
    };
  };

  it("Step 1-4: Detects open tabs, dirty buffers, and compares with disk content", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/app.ts";
    virtualDisk.set(tauriIpc.normalizePath(filePath), "const x = 1;");

    // Open model in editor
    const model = ModelService.createOrReuseModel(monaco, filePath, "const x = 1;", "typescript");
    expect(BufferSyncService.isDocumentOpen(filePath)).toBe(true);
    expect(await BufferSyncService.isDocumentDirty(filePath)).toBe(false);

    // User types into editor buffer
    model.setValue("const x = 2; // dirty in-memory");
    expect(await BufferSyncService.isDocumentDirty(filePath)).toBe(true);

    const compare = await BufferSyncService.compareBufferWithDisk(filePath);
    expect(compare.isOpen).toBe(true);
    expect(compare.isDirty).toBe(true);
    expect(compare.matches).toBe(false);
    expect(compare.bufferContent).toBe("const x = 2; // dirty in-memory");
    expect(compare.diskContent).toBe("const x = 1;");
  });

  it("Step 6-7: Refuses to silently overwrite dirty buffer and reports conflict", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/app.ts";
    virtualDisk.set(tauriIpc.normalizePath(filePath), "const x = 1;");

    const model = ModelService.createOrReuseModel(monaco, filePath, "const x = 1;", "typescript");
    model.setValue("const x = 99; // unsaved user edit");

    // Agent proposes change based on old base "const x = 1;"
    const prep = await BufferSyncService.prepareChange({
      path: filePath,
      proposedContent: "const x = 100;",
      baseContent: "const x = 1;",
    });

    expect(prep.allowed).toBe(false);
    expect(prep.conflict).not.toBeNull();
    expect(prep.conflict?.type).toBe("dirty_buffer");
    expect(prep.diff.status).toBe("conflict");
  });

  it("Step 6-7: Detects external disk conflicts when disk was changed", async () => {
    const filePath = "C:/project/app.ts";
    virtualDisk.set(tauriIpc.normalizePath(filePath), "const x = 50; // external change");

    const prep = await BufferSyncService.prepareChange({
      path: filePath,
      proposedContent: "const x = 2;",
      baseContent: "const x = 1;",
    });

    expect(prep.allowed).toBe(false);
    expect(prep.conflict?.type).toBe("disk_mismatch");
  });

  it("Step 8-10: Applies changes, preserves undo stack, syncs disk, and verifies contents", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/app.ts";
    const norm = tauriIpc.normalizePath(filePath);
    virtualDisk.set(norm, "const greeting = 'hello';");

    const model = ModelService.createOrReuseModel(monaco, filePath, "const greeting = 'hello';", "typescript");
    const initialVersion = BufferSyncService.getDocumentVersion(filePath);

    // Apply agent change
    const applyRes = await BufferSyncService.applyChange({
      path: filePath,
      newContent: "const greeting = 'hello world';",
      expectedVersion: initialVersion,
      preserveUndo: true,
      autoSave: true,
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.verified).toBe(true);

    // Disk and model are in sync
    expect(virtualDisk.get(norm)).toBe("const greeting = 'hello world';");
    expect(model.getValue()).toBe("const greeting = 'hello world';");

    // Undo restores previous content
    model.undo();
    expect(model.getValue()).toBe("const greeting = 'hello';");
  });

  it("detects concurrent modification when version changes between prep and apply", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/app.ts";
    virtualDisk.set(tauriIpc.normalizePath(filePath), "const a = 1;");

    const model = ModelService.createOrReuseModel(monaco, filePath, "const a = 1;", "typescript");
    const oldVersion = BufferSyncService.getDocumentVersion(filePath);

    // User types in editor, incrementing version
    model.setValue("const a = 1; // user edit");

    const res = await BufferSyncService.applyChange({
      path: filePath,
      newContent: "const a = 2;",
      expectedVersion: oldVersion,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Concurrent modification detected");
  });

  it("handles multiple tabs independently without cross-tab contamination", async () => {
    const monaco = createMockMonaco();
    const fileA = "C:/project/fileA.ts";
    const fileB = "C:/project/fileB.ts";

    virtualDisk.set(tauriIpc.normalizePath(fileA), "file A");
    virtualDisk.set(tauriIpc.normalizePath(fileB), "file B");

    const modelA = ModelService.createOrReuseModel(monaco, fileA, "file A", "typescript");
    const modelB = ModelService.createOrReuseModel(monaco, fileB, "file B", "typescript");

    // Make modelA dirty
    modelA.setValue("file A modified");
    expect(await BufferSyncService.isDocumentDirty(fileA)).toBe(true);
    expect(await BufferSyncService.isDocumentDirty(fileB)).toBe(false);

    // Apply change to fileB
    await BufferSyncService.applyChange({
      path: fileB,
      newContent: "file B updated",
    });

    expect(modelA.getValue()).toBe("file A modified");
    expect(modelB.getValue()).toBe("file B updated");
    expect(virtualDisk.get(tauriIpc.normalizePath(fileB))).toBe("file B updated");
  });

  it("safe file rename migrates Monaco models and preserves content", async () => {
    const monaco = createMockMonaco();
    const oldPath = "C:/project/old.ts";
    const newPath = "C:/project/new.ts";

    virtualDisk.set(tauriIpc.normalizePath(oldPath), "original code");
    const model = ModelService.createOrReuseModel(monaco, oldPath, "original code", "typescript");
    model.setValue("dirty code before rename");

    await BufferSyncService.renameFile(oldPath, newPath);

    expect(BufferSyncService.isDocumentOpen(oldPath)).toBe(false);
    expect(BufferSyncService.isDocumentOpen(newPath)).toBe(true);
    expect(BufferSyncService.getBufferContent(newPath)).toBe("dirty code before rename");
  });

  it("safe file delete disposes Monaco models cleanly", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/remove-me.ts";
    virtualDisk.set(tauriIpc.normalizePath(filePath), "bye");

    ModelService.createOrReuseModel(monaco, filePath, "bye", "typescript");
    expect(BufferSyncService.isDocumentOpen(filePath)).toBe(true);

    const delRes = await BufferSyncService.deleteFile(filePath);
    expect(delRes.success).toBe(true);
    expect(BufferSyncService.isDocumentOpen(filePath)).toBe(false);
  });

  it("rolls back in-memory model if disk write fails", async () => {
    const monaco = createMockMonaco();
    const filePath = "C:/project/fail.ts";
    const norm = tauriIpc.normalizePath(filePath);
    virtualDisk.set(norm, "initial content");

    const model = ModelService.createOrReuseModel(monaco, filePath, "initial content", "typescript");

    // Force saveDocument to fail
    vi.spyOn(EditorService, "saveDocument").mockRejectedValueOnce(new Error("Disk full error"));

    const applyRes = await BufferSyncService.applyChange({
      path: filePath,
      newContent: "broken edit",
      autoSave: true,
    });

    expect(applyRes.success).toBe(false);
    expect(applyRes.error).toContain("Disk full error");
    // Model rolled back to initial content
    expect(model.getValue()).toBe("initial content");
  });
});
