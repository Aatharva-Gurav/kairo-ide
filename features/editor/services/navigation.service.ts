/**
 * Code Navigation Service.
 * Provides Go to Definition, Peek Definition, Find References, Symbol navigation, and Go to Line.
 */

export class NavigationService {
  /**
   * Triggers Go to Definition in the active Monaco editor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static goToDefinition(editor: any): void {
    if (!editor) return;
    editor.trigger("navigation", "editor.action.revealDefinition", null);
  }

  /**
   * Triggers Peek Definition inline in the active Monaco editor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static peekDefinition(editor: any): void {
    if (!editor) return;
    editor.trigger("navigation", "editor.action.peekDefinition", null);
  }

  /**
   * Triggers Find References in the active Monaco editor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static findReferences(editor: any): void {
    if (!editor) return;
    editor.trigger("navigation", "editor.action.referenceSearch.trigger", null);
  }

  /**
   * Triggers Go to Symbol in the active Monaco editor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static goToSymbol(editor: any): void {
    if (!editor) return;
    editor.trigger("navigation", "editor.action.quickOutline", null);
  }

  /**
   * Navigates to a specific line and column in the active Monaco editor.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static goToLine(editor: any, lineNumber: number, column = 1, matchLength = 0): void {
    if (!editor || lineNumber < 1) return;

    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column });

    if (matchLength > 0) {
      editor.setSelection({
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + matchLength,
      });
    }

    editor.focus();
  }
}

