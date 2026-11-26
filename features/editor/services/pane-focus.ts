export type EditorPaneId = "primary" | "split";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PaneFocusState<T = any> {
  focusedPane: EditorPaneId;
  focusedDocPath: string | null;
  monacoEditorRef: { current: T | null };
  editors: Record<EditorPaneId, T | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPaneFocusState<T = any>(
  sharedRef: { current: T | null } = { current: null }
): PaneFocusState<T> {
  return {
    focusedPane: "primary",
    focusedDocPath: null,
    monacoEditorRef: sharedRef,
    editors: {
      primary: null,
      split: null,
    },
  };
}

export function registerPaneEditorInState<T>(
  state: PaneFocusState<T>,
  paneId: EditorPaneId,
  editor: T | null
): { focusedPane: EditorPaneId } {
  if (editor) {
    state.editors[paneId] = editor;
    if (!state.monacoEditorRef.current || state.focusedPane === paneId) {
      state.monacoEditorRef.current = editor;
    }
    return { focusedPane: state.focusedPane };
  }

  const previousEditor = state.editors[paneId];
  state.editors[paneId] = null;

  if (state.monacoEditorRef.current === previousEditor || !state.editors[state.focusedPane]) {
    const fallbackPane: EditorPaneId = paneId === "primary" ? "split" : "primary";
    const fallbackEditor = state.editors[fallbackPane];
    if (fallbackEditor) {
      state.monacoEditorRef.current = fallbackEditor;
      state.focusedPane = fallbackPane;
    } else {
      state.monacoEditorRef.current = null;
      state.focusedPane = "primary";
    }
  }

  return { focusedPane: state.focusedPane };
}

export function focusPaneInState<T>(
  state: PaneFocusState<T>,
  paneId: EditorPaneId,
  docPath?: string | null
): { focusedPane: EditorPaneId; focusedDocPath: string | null } {
  state.focusedPane = paneId;
  if (docPath !== undefined) {
    state.focusedDocPath = docPath;
  }
  const targetEditor = state.editors[paneId];
  if (targetEditor) {
    state.monacoEditorRef.current = targetEditor;
  }
  return {
    focusedPane: state.focusedPane,
    focusedDocPath: state.focusedDocPath,
  };
}
