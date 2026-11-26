import { normalizePath } from "@/lib/tauri-ipc";

/**
 * Monaco Model Management & ViewState Service.
 * Ensures:
 * - One model per file URI
 * - Reuse existing models instead of duplicating
 * - Disposes models when tabs are closed
 * - Preserves cursor & scroll viewState when switching between open tabs
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeModels = new Map<string, any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewStates = new Map<string, any>();

export class ModelService {
  /**
   * Creates or reuses a Monaco ITextModel associated with the file URI.
   */
  static createOrReuseModel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco: any,
    path: string,
    content: string,
    language: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (!monaco?.editor) return null;

    const norm = normalizePath(path);
    const uri = monaco.Uri.file(norm);

    let existingModel = monaco.editor.getModel(uri);
    if (existingModel && !existingModel.isDisposed()) {
      activeModels.set(norm, existingModel);
      return existingModel;
    }

    try {
      const newModel = monaco.editor.createModel(content, language, uri);
      activeModels.set(norm, newModel);
      return newModel;
    } catch {
      // Fallback if model already registered under different internal key
      existingModel = monaco.editor.getModel(uri);
      if (existingModel && !existingModel.isDisposed()) {
        activeModels.set(norm, existingModel);
        return existingModel;
      }
      return null;
    }
  }

  /**
   * Retrieves an existing non-disposed model for the path.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getModel(path: string): any {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    if (!model) return null;
    if (typeof model.isDisposed === "function" && model.isDisposed()) {
      activeModels.delete(norm);
      return null;
    }
    return model;
  }

  /**
   * Checks whether a registered, non-disposed model exists for the given path.
   */
  static hasModel(path: string): boolean {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    return !!model && (typeof model.isDisposed !== "function" || !model.isDisposed());
  }

  /**
   * Retrieves the current Monaco model version ID (increments on every edit).
   */
  static getVersionId(path: string): number | null {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    if (
      model &&
      typeof model.getVersionId === "function" &&
      (typeof model.isDisposed !== "function" || !model.isDisposed())
    ) {
      return model.getVersionId();
    }
    return null;
  }

  /**
   * Returns a list of all normalized file paths with active models.
   */
  static getOpenModelPaths(): string[] {
    const paths: string[] = [];
    activeModels.forEach((model, path) => {
      if (model && (typeof model.isDisposed !== "function" || !model.isDisposed())) {
        paths.push(path);
      }
    });
    return paths;
  }

  /**
   * Applies an edit to an existing Monaco model.
   * If preserveUndo is true, pushes an edit operation over the full model range
   * to preserve the undo/redo stack so users can Ctrl+Z agent changes.
   */
  static applyEdit(path: string, newContent: string, preserveUndo = true): boolean {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    if (!model || (typeof model.isDisposed === "function" && model.isDisposed())) {
      return false;
    }
    if (typeof model.getValue === "function" && model.getValue() === newContent) {
      return true;
    }

    if (
      preserveUndo &&
      typeof model.pushEditOperations === "function" &&
      typeof model.getFullModelRange === "function"
    ) {
      try {
        const fullRange = model.getFullModelRange();
        model.pushEditOperations(
          [],
          [{ range: fullRange, text: newContent }],
          () => null
        );
        return true;
      } catch (err) {
        console.warn(`[ModelService] Failed to pushEditOperations for ${path}, falling back to setValue:`, err);
      }
    }

    if (typeof model.setValue === "function") {
      model.setValue(newContent);
      return true;
    }
    return false;
  }

  /**
   * Updates an existing non-disposed Monaco model's content live without losing view state or editor binding.
   */
  static updateContent(path: string, newContent: string): boolean {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    if (!model) return false;
    if (typeof model.isDisposed === "function" && model.isDisposed()) {
      activeModels.delete(norm);
      return false;
    }
    if (model.getValue() !== newContent) {
      model.setValue(newContent);
    }
    return true;
  }

  /**
   * Disposes a Monaco model when a document tab is closed.
   */
  static disposeModel(path: string): void {
    const norm = normalizePath(path);
    const model = activeModels.get(norm);
    if (model) {
      try {
        model.dispose();
      } catch (err) {
        console.warn(`[ModelService] Error disposing model for ${path}:`, err);
      }
      activeModels.delete(norm);
    }
    viewStates.delete(norm);
  }

  /**
   * Saves the editor's cursor position and scroll state for the document.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static saveViewState(editor: any, path: string): void {
    if (!editor || !path) return;
    try {
      const state = editor.saveViewState();
      if (state) {
        viewStates.set(normalizePath(path), state);
      }
    } catch {
      // Ignore if editor already unmounted
    }
  }

  /**
   * Restores previously saved view state for the document.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static restoreViewState(editor: any, path: string): void {
    if (!editor || !path) return;
    const state = viewStates.get(normalizePath(path));
    if (state) {
      try {
        editor.restoreViewState(state);
      } catch {
        // Safe fallback
      }
    }
  }

  /**
   * Rebinds or transfers active model and view state when a file or directory is renamed or moved.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static renamePath(oldPath: string, newPath: string, monaco?: any): void {
    const normOld = normalizePath(oldPath);
    const normNew = normalizePath(newPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoInstance = monaco || (typeof window !== "undefined" ? (window as any).monaco : null);

    // Exact file match
    if (activeModels.has(normOld)) {
      const oldModel = activeModels.get(normOld);
      activeModels.delete(normOld);
      if (oldModel && (typeof oldModel.isDisposed !== "function" || !oldModel.isDisposed())) {
        if (monacoInstance?.editor && monacoInstance?.Uri) {
          try {
            const content = oldModel.getValue();
            const language = oldModel.getLanguageId();
            oldModel.dispose();
            const newUri = monacoInstance.Uri.file(normNew);
            const newModel = monacoInstance.editor.createModel(content, language, newUri);
            activeModels.set(normNew, newModel);
          } catch {
            activeModels.set(normNew, oldModel);
          }
        } else {
          activeModels.set(normNew, oldModel);
        }
      }
    }
    if (viewStates.has(normOld)) {
      const vs = viewStates.get(normOld);
      viewStates.delete(normOld);
      viewStates.set(normNew, vs);
    }

    // Subpath matches (e.g. folder moved or renamed)
    const matchingModelKeys = Array.from(activeModels.keys()).filter((p) =>
      p.startsWith(normOld + "/")
    );
    for (const p of matchingModelKeys) {
      const model = activeModels.get(p);
      const sub = p.slice(normOld.length);
      const updated = normNew + sub;
      activeModels.delete(p);
      if (model && monacoInstance?.editor && monacoInstance?.Uri) {
        try {
          const content = model.getValue();
          const language = model.getLanguageId();
          model.dispose();
          const newUri = monacoInstance.Uri.file(updated);
          const newModel = monacoInstance.editor.createModel(content, language, newUri);
          activeModels.set(updated, newModel);
        } catch {
          activeModels.set(updated, model);
        }
      } else if (model) {
        activeModels.set(updated, model);
      }
    }

    const matchingViewStateKeys = Array.from(viewStates.keys()).filter((p) =>
      p.startsWith(normOld + "/")
    );
    for (const p of matchingViewStateKeys) {
      const vs = viewStates.get(p);
      const sub = p.slice(normOld.length);
      const updated = normNew + sub;
      viewStates.delete(p);
      viewStates.set(updated, vs);
    }
  }

  /**
   * Disposes all models within a deleted path (file or folder).
   */
  static disposePath(path: string): void {
    const norm = normalizePath(path);
    ModelService.disposeModel(norm);

    // Also dispose any models inside if it was a directory
    activeModels.forEach((model, p) => {
      if (p.startsWith(norm + "/")) {
        try {
          model.dispose();
        } catch {
          // Safe fallback
        }
        activeModels.delete(p);
        viewStates.delete(p);
      }
    });
  }

  /**
   * Cleans up all models and view states (e.g. on workspace switch / close).
   */
  static disposeAll(): void {
    activeModels.forEach((model) => {
      try {
        model.dispose();
      } catch {
        // Ignore
      }
    });
    activeModels.clear();
    viewStates.clear();
  }
}

