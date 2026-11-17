import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckpointService, InMemoryCheckpointStorage } from "./checkpoint.service";
import { ModelService } from "@/features/editor/services/model.service";
import { EditorService } from "@/features/editor/services/editor.service";
import { BufferSyncService } from "@/features/editor/services/buffer-sync.service";
import { DiffService } from "@/lib/diff/diff-service";
import * as tauriIpc from "@/lib/tauri-ipc";

describe("CheckpointService (Git-Independent)", () => {
  const virtualDisk = new Map<string, string>();
  let service: CheckpointService;

  beforeEach(() => {
    ModelService.disposeAll();
    virtualDisk.clear();
    service = new CheckpointService(new InMemoryCheckpointStorage());

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
              _before: unknown,
              edits: Array<{ range: unknown; text: string }>
            ) => {
              if (edits.length > 0) {
                currentContent = edits[0].text;
              }
              versionId++;
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

  it("creates a checkpoint capturing both disk and active in-memory Monaco buffer", async () => {
    const monaco = createMockMonaco();
    const file1 = "C:/app/main.ts";
    const file2 = "C:/app/dirty.ts";

    virtualDisk.set(tauriIpc.normalizePath(file1), "console.log('main');");
    virtualDisk.set(tauriIpc.normalizePath(file2), "const a = 1;");

    // Open file2 in Monaco and edit it
    const model2 = ModelService.createOrReuseModel(monaco, file2, "const a = 1;", "typescript");
    model2.setValue("const a = 2; // dirty in memory");

    const checkpoint = await service.createCheckpoint({
      label: "Before Refactor",
      filePaths: [file1, file2],
      sessionId: "session-101",
    });

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.label).toBe("Before Refactor");
    expect(checkpoint.entries[tauriIpc.normalizePath(file1)].originalContent).toBe("console.log('main');");
    expect(checkpoint.entries[tauriIpc.normalizePath(file2)].originalContent).toBe("const a = 2; // dirty in memory");
    expect(checkpoint.entries[tauriIpc.normalizePath(file2)].wasDirty).toBe(true);
    expect(checkpoint.entries[tauriIpc.normalizePath(file2)].wasOpen).toBe(true);
  });

  it("records proposed diff against checkpoint", async () => {
    const file1 = "C:/app/main.ts";
    virtualDisk.set(tauriIpc.normalizePath(file1), "let x = 1;");

    const checkpoint = await service.createCheckpoint({
      label: "Pre-Edit",
      filePaths: [file1],
    });

    const diff = DiffService.createFileDiff({
      path: file1,
      oldContent: "let x = 1;",
      newContent: "let x = 999;",
    });

    await service.recordDiff(checkpoint.id, diff);

    const updated = await service.getCheckpoint(checkpoint.id);
    const entry = updated?.entries[tauriIpc.normalizePath(file1)];
    expect(entry?.newContent).toBe("let x = 999;");
    expect(entry?.diff).toBeDefined();
  });

  it("safely restores modified files in both Monaco model and disk", async () => {
    const monaco = createMockMonaco();
    const file = "C:/app/code.ts";
    const norm = tauriIpc.normalizePath(file);
    virtualDisk.set(norm, "original code");

    const model = ModelService.createOrReuseModel(monaco, file, "original code", "typescript");

    const checkpoint = await service.createCheckpoint({
      label: "Original State",
      filePaths: [file],
    });

    // Agent modifies file and writes to disk
    await BufferSyncService.applyChange({
      path: file,
      newContent: "agent modified code",
    });
    expect(model.getValue()).toBe("agent modified code");
    expect(virtualDisk.get(norm)).toBe("agent modified code");

    // Restore checkpoint
    const restoreRes = await service.restoreCheckpoint(checkpoint.id);
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.restoredFiles).toContain(norm);

    // Verify both disk and Monaco model are restored to original code
    expect(model.getValue()).toBe("original code");
    expect(virtualDisk.get(norm)).toBe("original code");
  });

  it("safely deletes newly created files on restoration", async () => {
    const createdFile = "C:/app/agent-generated.ts";
    const norm = tauriIpc.normalizePath(createdFile);
    // File did not exist when checkpoint was created
    const checkpoint = await service.createCheckpoint({
      label: "Before agent added file",
      filePaths: [createdFile],
    });
    expect(checkpoint.entries[norm].originalContent).toBeNull();

    // Agent created file
    virtualDisk.set(norm, "new file content");
    vi.spyOn(BufferSyncService, "deleteFile").mockImplementation(async (p: string) => {
      virtualDisk.delete(tauriIpc.normalizePath(p));
      return { success: true };
    });

    const restoreRes = await service.restoreCheckpoint(checkpoint.id);
    expect(restoreRes.success).toBe(true);
    expect(virtualDisk.has(norm)).toBe(false);
  });

  it("supports partial file restoration", async () => {
    const fileA = "C:/app/a.ts";
    const fileB = "C:/app/b.ts";
    virtualDisk.set(tauriIpc.normalizePath(fileA), "a_orig");
    virtualDisk.set(tauriIpc.normalizePath(fileB), "b_orig");

    const checkpoint = await service.createCheckpoint({
      label: "Batch",
      filePaths: [fileA, fileB],
    });

    virtualDisk.set(tauriIpc.normalizePath(fileA), "a_mod");
    virtualDisk.set(tauriIpc.normalizePath(fileB), "b_mod");

    // Restore ONLY fileA
    const restoreRes = await service.restoreCheckpoint(checkpoint.id, {
      filePaths: [fileA],
    });

    expect(restoreRes.success).toBe(true);
    expect(restoreRes.restoredFiles).toContain(tauriIpc.normalizePath(fileA));
    expect(virtualDisk.get(tauriIpc.normalizePath(fileA))).toBe("a_orig");
    expect(virtualDisk.get(tauriIpc.normalizePath(fileB))).toBe("b_mod");
  });

  it("handles storage deletion and listing", async () => {
    const cp = await service.createCheckpoint({
      label: "List Test",
      filePaths: [],
      sessionId: "session-abc",
    });

    const list = await service.listCheckpoints("session-abc");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(cp.id);

    const deleted = await service.deleteCheckpoint(cp.id);
    expect(deleted).toBe(true);
    expect(await service.getCheckpoint(cp.id)).toBeNull();
  });
});
