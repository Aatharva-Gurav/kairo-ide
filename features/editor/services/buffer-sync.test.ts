import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BufferSyncService, EditorDocumentSnapshot } from "./buffer-sync.service";
import { ModelService } from "./model.service";
import { EditorService } from "./editor.service";
import { ConflictDetails } from "@/lib/diff/types";
import * as tauriIpc from "@/lib/tauri-ipc";

describe("BufferSyncService & 10-Step Protocol", () => {
  // In-memory virtual disk for tests
  const virtualDisk = new Map<string, string>();

  beforeEach(() => {
    BufferSyncService.resetStateForTests();
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

  describe("Stage 2C Synchronization, IPC & Lifecycle Repairs", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      BufferSyncService.resetStateForTests();
    });

    it("uses valid native IPC command names fs_delete and fs_rename", async () => {
      const invokeSpy = vi.spyOn(tauriIpc, "invokeCommand").mockResolvedValue(undefined);
      const monaco = createMockMonaco();
      const fileA = "C:/project/a.ts";
      const fileB = "C:/project/b.ts";

      ModelService.createOrReuseModel(monaco, fileA, "const a = 1;", "typescript");
      const renameRes = await BufferSyncService.renameFile(fileA, fileB, monaco);
      expect(renameRes.success).toBe(true);
      expect(invokeSpy).toHaveBeenCalledWith("fs_rename", {
        oldPath: tauriIpc.normalizePath(fileA),
        newPath: tauriIpc.normalizePath(fileB),
      });

      const deleteRes = await BufferSyncService.deleteFile(fileB);
      expect(deleteRes.success).toBe(true);
      expect(invokeSpy).toHaveBeenCalledWith("fs_delete", {
        path: tauriIpc.normalizePath(fileB),
        isDir: false,
      });
    });

    it("preserves open Monaco models when rename or delete IPC fails", async () => {
      const monaco = createMockMonaco();
      const oldPath = "C:/project/locked.ts";
      ModelService.createOrReuseModel(monaco, oldPath, "important dirty code", "typescript");

      vi.spyOn(tauriIpc, "invokeCommand").mockRejectedValueOnce(new Error("Permission denied"));
      const renameFail = await BufferSyncService.renameFile(oldPath, "C:/project/moved.ts", monaco);
      expect(renameFail.success).toBe(false);
      expect(BufferSyncService.isDocumentOpen(oldPath)).toBe(true);
      expect(BufferSyncService.isDocumentOpen("C:/project/moved.ts")).toBe(false);

      vi.spyOn(tauriIpc, "invokeCommand").mockRejectedValueOnce(new Error("File locked"));
      const deleteFail = await BufferSyncService.deleteFile(oldPath);
      expect(deleteFail.success).toBe(false);
      expect(BufferSyncService.isDocumentOpen(oldPath)).toBe(true);
    });

    it("integrates with live EditorContext documents bridge for unmounted tabs and dirty state", async () => {
      const filePath = "C:/project/tab-only.ts";
      const norm = tauriIpc.normalizePath(filePath);
      virtualDisk.set(norm, "saved line");

      const docs: EditorDocumentSnapshot[] = [
        {
          id: norm,
          path: norm,
          content: "unsaved tab edit",
          savedContent: "saved line",
          isDirty: true,
        },
      ];
      const conflicts: ConflictDetails[] = [];

      const disconnect = BufferSyncService.connectEditorBridge({
        getDocuments: () => docs,
        applySyncToDocument: (p, newContent, options) => {
          const target = docs.find((d) => d.path === tauriIpc.normalizePath(p));
          if (target) {
            target.content = newContent;
            if (options.saved) target.savedContent = newContent;
            target.isDirty = options.saved ? false : newContent !== target.savedContent;
          }
        },
        reportConflict: (c) => conflicts.push(c),
        clearConflict: vi.fn(),
      });

      expect(BufferSyncService.isDocumentOpen(filePath)).toBe(true);
      expect(await BufferSyncService.isDocumentDirty(filePath)).toBe(true);

      // Prepare change detects unsaved buffer conflict on unmounted tab
      const prep = await BufferSyncService.prepareChange({
        path: filePath,
        proposedContent: "incoming edit",
        baseContent: "saved line",
      });
      expect(prep.allowed).toBe(false);
      expect(prep.conflict?.type).toBe("dirty_buffer");
      expect(conflicts).toHaveLength(1);

      // Applying change with autoSave=false keeps isDirty=true in EditorContext.documents
      const cleanPath = "C:/project/clean-tab.ts";
      const cleanNorm = tauriIpc.normalizePath(cleanPath);
      virtualDisk.set(cleanNorm, "initial");
      docs.push({
        id: cleanNorm,
        path: cleanNorm,
        content: "initial",
        savedContent: "initial",
        isDirty: false,
      });

      const applyNoSave = await BufferSyncService.applyChange({
        path: cleanPath,
        newContent: "buffered edit",
        autoSave: false,
      });
      expect(applyNoSave.success).toBe(true);
      const updatedDoc = docs.find((d) => d.path === cleanNorm)!;
      expect(updatedDoc.content).toBe("buffered edit");
      expect(updatedDoc.isDirty).toBe(true);
      expect(virtualDisk.get(cleanNorm)).toBe("initial");

      disconnect();
    });

    it("detects missing file conflicts (deleted_target) and rejects out-of-workspace paths", async () => {
      BufferSyncService.setWorkspaceScope("C:/workspace/alpha");
      virtualDisk.set("C:/workspace/alpha/src/index.ts", "export const ok = true;");
      virtualDisk.set("C:/workspace/beta/secret.ts", "secret");

      // Outside workspace & path traversal rejected
      const outPrep = await BufferSyncService.prepareChange({
        path: "C:/workspace/beta/secret.ts",
        proposedContent: "hacked",
      });
      expect(outPrep.allowed).toBe(false);
      expect(outPrep.error).toContain("outside the authorized workspace");

      const travRes = await BufferSyncService.applyChange({
        path: "C:/workspace/alpha/../beta/secret.ts",
        newContent: "hacked",
      });
      expect(travRes.success).toBe(false);
      expect(travRes.error).toContain("traversal");

      // Missing target on disk produces deleted_target conflict instead of silent empty content
      const missingPrep = await BufferSyncService.prepareChange({
        path: "C:/workspace/alpha/src/missing.ts",
        proposedContent: "hello",
        baseContent: "old content",
      });
      expect(missingPrep.allowed).toBe(false);
      expect(missingPrep.conflict?.type).toBe("deleted_target");
    });

    it("aborts stale async sync operations when workspace switches mid-flight", async () => {
      BufferSyncService.setWorkspaceScope("C:/workspace/one");
      const target = "C:/workspace/one/app.ts";

      vi.spyOn(tauriIpc, "readFileContent").mockImplementationOnce(async () => {
        // Simulate workspace switch completing before disk read resolves
        BufferSyncService.setWorkspaceScope("C:/workspace/two");
        return {
          content: "const v = 1;",
          isBinary: false,
          size: 12,
          readonly: false,
        };
      });

      const prep = await BufferSyncService.prepareChange({
        path: target,
        proposedContent: "const v = 2;",
        baseContent: "const v = 1;",
      });
      expect(prep.allowed).toBe(false);
      expect(prep.error).toContain("Workspace changed");
    });

    it("preserves CRLF line endings when applying edits", async () => {
      const filePath = "C:/project/crlf.ts";
      const norm = tauriIpc.normalizePath(filePath);
      virtualDisk.set(norm, "line1\r\nline2\r\n");

      const monaco = createMockMonaco();
      const model = ModelService.createOrReuseModel(monaco, filePath, "line1\r\nline2\r\n", "typescript");

      const res = await BufferSyncService.applyChange({
        path: filePath,
        newContent: "line1\nupdated\n",
        autoSave: true,
        preserveLineEndings: true,
      });

      expect(res.success).toBe(true);
      expect(model.getValue()).toBe("line1\r\nupdated\r\n");
      expect(virtualDisk.get(norm)).toBe("line1\r\nupdated\r\n");
    });
  });
});
