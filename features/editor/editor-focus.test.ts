import { describe, it, expect, vi } from "vitest";
import {
  createPaneFocusState,
  registerPaneEditorInState,
  focusPaneInState,
} from "./services/pane-focus";
import { NavigationService } from "./services/navigation.service";

function createMockEditor(name: string) {
  return {
    name,
    focus: vi.fn(),
    trigger: vi.fn(),
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn(),
    setSelection: vi.fn(),
    getSelection: vi.fn(() => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    })),
    executeEdits: vi.fn(),
    getModel: vi.fn(() => ({
      getLineCount: () => 100,
      getLineMaxColumn: () => 80,
    })),
  };
}

describe("Monaco Split-Pane Focus & Targeting (Stage 2B)", () => {
  it("routes monacoEditorRef, Go to Line, and Cut/Copy/Paste to the currently focused pane", () => {
    const state = createPaneFocusState<ReturnType<typeof createMockEditor>>();
    const primary = createMockEditor("primary");
    const split = createMockEditor("split");

    // Mount primary then split (simulates opening split view right)
    registerPaneEditorInState(state, "primary", primary);
    expect(state.monacoEditorRef.current).toBe(primary);

    registerPaneEditorInState(state, "split", split);
    focusPaneInState(state, "split", "/ws/b.ts");
    expect(state.monacoEditorRef.current).toBe(split);
    expect(state.focusedPane).toBe("split");

    // Refocus primary pane: split mounted last must NOT hijack actions
    focusPaneInState(state, "primary", "/ws/a.ts");
    expect(state.monacoEditorRef.current).toBe(primary);
    expect(state.focusedPane).toBe("primary");

    // Go to Line targets focused primary pane only
    NavigationService.goToLine(state.monacoEditorRef.current, 42, 7);
    expect(primary.revealLineInCenter).toHaveBeenCalledWith(42);
    expect(primary.setPosition).toHaveBeenCalledWith({ lineNumber: 42, column: 7 });
    expect(split.revealLineInCenter).not.toHaveBeenCalled();

    // Switch focus back to split pane: Cut/Copy/Paste target split only
    focusPaneInState(state, "split", "/ws/b.ts");
    const ed = state.monacoEditorRef.current!;
    ed.focus();
    ed.trigger("menu", "editor.action.clipboardCutAction", null);
    ed.trigger("menu", "editor.action.clipboardCopyAction", null);
    ed.executeEdits("menu-paste", [{ range: ed.getSelection(), text: "pasted", forceMoveMarkers: true }]);

    expect(split.trigger).toHaveBeenCalledWith("menu", "editor.action.clipboardCutAction", null);
    expect(split.trigger).toHaveBeenCalledWith("menu", "editor.action.clipboardCopyAction", null);
    expect(split.executeEdits).toHaveBeenCalledWith("menu-paste", [
      expect.objectContaining({ text: "pasted" }),
    ]);
    expect(primary.trigger).not.toHaveBeenCalled();
    expect(primary.executeEdits).not.toHaveBeenCalled();
  });

  it("disposes focused split pane cleanly and restores fallback to primary pane", () => {
    const state = createPaneFocusState<ReturnType<typeof createMockEditor>>();
    const primary = createMockEditor("primary");
    const split = createMockEditor("split");

    registerPaneEditorInState(state, "primary", primary);
    registerPaneEditorInState(state, "split", split);
    focusPaneInState(state, "split", "/ws/b.ts");

    expect(state.monacoEditorRef.current).toBe(split);

    // Unmount/dispose split pane -> must restore monacoEditorRef to primary
    registerPaneEditorInState(state, "split", null);
    expect(state.monacoEditorRef.current).toBe(primary);
    expect(state.focusedPane).toBe("primary");

    // Unmount/dispose primary pane -> clears ref completely
    registerPaneEditorInState(state, "primary", null);
    expect(state.monacoEditorRef.current).toBeNull();
  });
});
