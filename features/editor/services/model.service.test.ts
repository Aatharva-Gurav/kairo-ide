import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelService } from "./model.service";

describe("ModelService", () => {
  beforeEach(() => {
    ModelService.disposeAll();
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
          const mockModel = {
            getValue: () => currentContent,
            setValue: (val: string) => {
              currentContent = val;
            },
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

  it("creates a new model when not registered and reuses existing without resetting value", () => {
    const monaco = createMockMonaco();
    const model1 = ModelService.createOrReuseModel(
      monaco,
      "C:/test/file.ts",
      "const a = 1;",
      "typescript"
    );
    expect(model1).toBeDefined();
    expect(model1.getValue()).toBe("const a = 1;");

    // Modify in-memory content (as user typing)
    model1.setValue("const a = 2;");

    // Reusing the model (e.g. switching back to tab) must NOT reset the value
    const model2 = ModelService.createOrReuseModel(
      monaco,
      "C:/test/file.ts",
      "const a = 1;",
      "typescript"
    );
    expect(model2).toBe(model1);
    expect(model2.getValue()).toBe("const a = 2;");
  });

  it("updates content cleanly via ModelService.updateContent", () => {
    const monaco = createMockMonaco();
    ModelService.createOrReuseModel(
      monaco,
      "C:/test/file.ts",
      "const a = 1;",
      "typescript"
    );

    const updated = ModelService.updateContent("C:/test/file.ts", "const a = 99;");
    expect(updated).toBe(true);
    expect(ModelService.getModel("C:/test/file.ts")?.getValue()).toBe("const a = 99;");
  });

  it("saves and restores view states across file paths", () => {
    const fakeState = { scroll: 100, cursor: { lineNumber: 5, column: 2 } };
    const mockEditor = {
      saveViewState: () => fakeState,
      restoreViewState: vi.fn(),
    };

    ModelService.saveViewState(mockEditor, "C:/test/file.ts");
    ModelService.restoreViewState(mockEditor, "C:/test/file.ts");

    expect(mockEditor.restoreViewState).toHaveBeenCalledWith(fakeState);
  });

  it("migrates model and view state on file rename", () => {
    const monaco = createMockMonaco();
    const fakeState = { scroll: 50 };
    const mockEditor = {
      saveViewState: () => fakeState,
      restoreViewState: vi.fn(),
    };

    ModelService.createOrReuseModel(
      monaco,
      "C:/test/old.ts",
      "const old = true;",
      "typescript"
    );
    ModelService.saveViewState(mockEditor, "C:/test/old.ts");

    ModelService.renamePath("C:/test/old.ts", "C:/test/new.ts", monaco);

    expect(ModelService.getModel("C:/test/old.ts")).toBeNull();
    const newModel = ModelService.getModel("C:/test/new.ts");
    expect(newModel).toBeDefined();
    expect(newModel.getValue()).toBe("const old = true;");

    ModelService.restoreViewState(mockEditor, "C:/test/new.ts");
    expect(mockEditor.restoreViewState).toHaveBeenCalledWith(fakeState);
  });

  it("disposes models and view states properly", () => {
    const monaco = createMockMonaco();
    const model = ModelService.createOrReuseModel(
      monaco,
      "C:/test/file.ts",
      "const x = 1;",
      "typescript"
    );
    expect(ModelService.getModel("C:/test/file.ts")).toBe(model);

    ModelService.disposeModel("C:/test/file.ts");
    expect(ModelService.getModel("C:/test/file.ts")).toBeNull();
  });
});

