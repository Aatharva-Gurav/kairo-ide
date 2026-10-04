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
    if (existingModel) {
      // Update content if model content changed externally and is not dirty
      if (existingModel.getValue() !== content) {
        existingModel.setValue(content);
      }
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
      if (existingModel) {
        activeModels.set(norm, existingModel);
        return existingModel;
      }
      return null;
    }
  }

  /**
   * Retrieves an existing registered model for the path.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getModel(path: string): any {
    return activeModels.get(normalizePath(path)) || null;
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

    // Exact file match
    if (activeModels.has(normOld)) {
      const oldModel = activeModels.get(normOld);
      activeModels.delete(normOld);
      if (oldModel && monaco?.editor && monaco?.Uri) {
        try {
          const content = oldModel.getValue();
          const language = oldModel.getLanguageId();
          oldModel.dispose();
          const newUri = monaco.Uri.file(normNew);
          const newModel = monaco.editor.createModel(content, language, newUri);
          activeModels.set(normNew, newModel);
        } catch {
          // Fallback
        }
      }
    }
    if (viewStates.has(normOld)) {
      const vs = viewStates.get(normOld);
      viewStates.delete(normOld);
      viewStates.set(normNew, vs);
    }

    // Subpath matches (e.g. folder moved or renamed)
    activeModels.forEach((model, p) => {
      if (p.startsWith(normOld + "/")) {
        const sub = p.slice(normOld.length);
        const updated = normNew + sub;
        activeModels.delete(p);
        if (model && monaco?.editor && monaco?.Uri) {
          try {
            const content = model.getValue();
            const language = model.getLanguageId();
            model.dispose();
            const newUri = monaco.Uri.file(updated);
            const newModel = monaco.editor.createModel(content, language, newUri);
            activeModels.set(updated, newModel);
          } catch {
            // Fallback
          }
        }
      }
    });

    viewStates.forEach((vs, p) => {
      if (p.startsWith(normOld + "/")) {
        const sub = p.slice(normOld.length);
        const updated = normNew + sub;
        viewStates.delete(p);
        viewStates.set(updated, vs);
      }
    });
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

