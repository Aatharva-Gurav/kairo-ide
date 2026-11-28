/**
 * Lightweight, XSS-safe GitHub Flavored Markdown (GFM) parser producing typed AST nodes.
 * Designed for fast, dependency-free React rendering in Kairo IDE.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineToken[] }
  | { type: "italic"; children: InlineToken[] }
  | { type: "strike"; children: InlineToken[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineToken[] }
  | { type: "image"; src: string; alt: string };

export interface ListItemNode {
  checked?: boolean;
  children: InlineToken[];
}

export type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; children: InlineToken[] }
  | { type: "paragraph"; children: InlineToken[] }
  | { type: "code"; lang: string; code: string }
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItemNode[] }
  | { type: "table"; alignments: Array<"left" | "center" | "right" | null>; headers: InlineToken[][]; rows: InlineToken[][][] }
  | { type: "hr" };

export interface MarkdownStats {
  words: number;
  characters: number;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function countMarkdownStats(content: string): MarkdownStats {
  const characters = content.length;
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { words, characters };
}

/**
 * Parses inline Markdown syntax (code spans, images, links, bold, italic, strikethrough).
 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;

  const pushText = (val: string) => {
    if (!val) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === "text") {
      prev.value += val;
    } else {
      tokens.push({ type: "text", value: val });
    }
  };

  while (i < text.length) {
    // Escaped character
    if (text[i] === "\\" && i + 1 < text.length) {
      pushText(text[i + 1]);
      i += 2;
      continue;
    }

    // Inline code (`...`)
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        tokens.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Image (![alt](src))
    if (text[i] === "!" && text[i + 1] === "[") {
      const closeBracket = text.indexOf("]", i + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = findClosingParen(text, closeBracket + 2);
        if (closeParen !== -1) {
          const alt = text.slice(i + 2, closeBracket);
          const src = text.slice(closeBracket + 2, closeParen).trim();
          tokens.push({ type: "image", src, alt });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Link ([label](href))
    if (text[i] === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = findClosingParen(text, closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen).trim();
          tokens.push({ type: "link", href, children: parseInline(label) });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold (**...** or __...__)
    if (
      (text.startsWith("**", i) || text.startsWith("__", i)) &&
      i + 2 < text.length
    ) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end !== -1 && end > i + 2) {
        tokens.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Strikethrough (~~...~~)
    if (text.startsWith("~~", i) && i + 2 < text.length) {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1 && end > i + 2) {
        tokens.push({ type: "strike", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Italic (*...* or _..._)
    if ((text[i] === "*" || text[i] === "_") && i + 1 < text.length && text[i + 1] !== " ") {
      const marker = text[i];
      const end = text.indexOf(marker, i + 1);
      if (end !== -1 && end > i + 1) {
        tokens.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    pushText(text[i]);
    i += 1;
  }

  return tokens;
}

function findClosingParen(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function parseTableAlignments(line: string): Array<"left" | "center" | "right" | null> {
  return splitTableRow(line).map((cell) => {
    const t = cell.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function isListLine(line: string): { ordered: boolean; indent: number; markerNum: number; content: string } | null {
  const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (ulMatch) {
    return { ordered: false, indent: ulMatch[1].length, markerNum: 1, content: ulMatch[2] };
  }
  const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (olMatch) {
    return {
      ordered: true,
      indent: olMatch[1].length,
      markerNum: parseInt(olMatch[2], 10) || 1,
      content: olMatch[3],
    };
  }
  return null;
}

/**
 * Parses a Markdown document string into block AST nodes.
 */
export function parseMarkdown(markdown: string): BlockNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block (``` or ~~~)
    const fenceMatch = trimmed.match(/^(```|~~~)(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s+/g, ""))) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ATX Heading (# .. ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const rawText = headingMatch[2];
      blocks.push({
        type: "heading",
        level,
        id: slugifyHeading(rawText),
        children: parseInline(rawText),
      });
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", children: parseMarkdown(quoteLines.join("\n")) });
      continue;
    }

    // GFM Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(line).map((cell) => parseInline(cell));
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;
      const rows: InlineToken[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]).map((cell) => parseInline(cell)));
        i++;
      }
      blocks.push({ type: "table", alignments, headers, rows });
      continue;
    }

    // Lists (ordered, unordered, task lists)
    const listStart = isListLine(line);
    if (listStart) {
      const ordered = listStart.ordered;
      const start = listStart.markerNum;
      const items: ListItemNode[] = [];

      while (i < lines.length) {
        const cur = isListLine(lines[i]);
        if (!cur || cur.ordered !== ordered) break;

        let content = cur.content;
        let checked: boolean | undefined;
        const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          checked = taskMatch[1].toLowerCase() === "x";
          content = taskMatch[2];
        }
        items.push({ checked, children: parseInline(content) });
        i++;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    // Paragraph (collect contiguous non-block lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      const curTrim = cur.trim();
      if (
        !curTrim ||
        /^(```|~~~)/.test(curTrim) ||
        /^#{1,6}\s+/.test(curTrim) ||
        curTrim.startsWith(">") ||
        isListLine(cur) !== null ||
        /^(?:-{3,}|\*{3,}|_{3,})$/.test(curTrim.replace(/\s+/g, "")) ||
        (cur.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(curTrim);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paraLines.join(" ")) });
    }
  }

  return blocks;
}
