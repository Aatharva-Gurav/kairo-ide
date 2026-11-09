import { ILinkProvider, ILink, Terminal } from "@xterm/xterm";
import { ideEvents } from "@/lib/events";

/**
 * Regex matching relative or absolute file paths, optionally followed by :line:col
 * Examples:
 *   src/main.rs:24:10
 *   features/terminal/types.ts:42
 *   components/ui/button.tsx
 *   c:\work\kairo-ide\app\page.tsx:15
 */
const FILE_PATH_WITH_POSITION_REGEX =
  /(?:^|[\s"'`([])([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;

export class TerminalLinkProvider implements ILinkProvider {
  constructor(private term: Terminal, private workspaceRoot?: string) {}

  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const line = this.term.buffer.active.getLine(bufferLineNumber);
    if (!line) {
      callback(undefined);
      return;
    }

    const lineText = line.translateToString(true);
    const links: ILink[] = [];

    let match: RegExpExecArray | null;
    FILE_PATH_WITH_POSITION_REGEX.lastIndex = 0;

    while ((match = FILE_PATH_WITH_POSITION_REGEX.exec(lineText)) !== null) {
      const fullMatch = match[0];
      const filePath = match[1];
      const lineStr = match[2];
      const colStr = match[3];

      // Ignore common non-file extensions (e.g., domain extensions like .com, .org, .net, .io)
      if (/\.(com|org|net|io|dev|app|gov|edu|ai|co)$/i.test(filePath)) {
        continue;
      }

      // Calculate start index skipping leading whitespace or bracket
      const offset = fullMatch.indexOf(filePath);
      const startIndex = match.index + offset + 1; // 1-based for xterm
      const length = fullMatch.trim().length - offset;

      const lineNumber = lineStr ? parseInt(lineStr, 10) : 1;
      const columnNumber = colStr ? parseInt(colStr, 10) : 1;

      // Resolve path against workspaceRoot if relative
      let resolvedPath = filePath;
      if (
        this.workspaceRoot &&
        !filePath.startsWith("/") &&
        !filePath.match(/^[a-zA-Z]:[\\/]/)
      ) {
        resolvedPath = `${this.workspaceRoot.replace(/[\\/]$/, "")}/${filePath.replace(/^[\\/]/, "")}`;
      }

      links.push({
        range: {
          start: { x: startIndex, y: bufferLineNumber + 1 },
          end: { x: startIndex + length - 1, y: bufferLineNumber + 1 },
        },
        text: match[0].trim(),
        activate: () => {
          ideEvents.emit("search:navigate-to-match", {
            path: resolvedPath,
            line: lineNumber,
            column: columnNumber,
          });
        },
      });
    }

    callback(links.length > 0 ? links : undefined);
  }
}
