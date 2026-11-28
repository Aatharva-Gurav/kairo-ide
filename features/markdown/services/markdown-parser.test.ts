import { describe, it, expect } from "vitest";
import {
  parseMarkdown,
  countMarkdownStats,
  slugifyHeading,
} from "./markdown-parser";

describe("markdown-parser", () => {
  it("parses headings, paragraphs, code blocks, and horizontal rules", () => {
    const md = [
      "# Hello World",
      "",
      "This is **bold**, *italic*, ~~strike~~, and `code`.",
      "",
      "```rust",
      "fn main() {}",
      "```",
      "",
      "---",
    ].join("\n");

    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1, id: "hello-world" });
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2]).toEqual({ type: "code", lang: "rust", code: "fn main() {}" });
    expect(blocks[3]).toEqual({ type: "hr" });
  });

  it("parses GFM task lists and tables", () => {
    const md = [
      "- [x] Done task",
      "- [ ] Open task",
      "",
      "| Name | Role |",
      "| :--- | ---: |",
      "| Ada | Dev |",
    ].join("\n");

    const blocks = parseMarkdown(md);
    expect(blocks[0]).toMatchObject({
      type: "list",
      ordered: false,
      items: [
        { checked: true },
        { checked: false },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: "table",
      alignments: ["left", "right"],
    });
  });

  it("counts words and characters and slugifies headings", () => {
    expect(countMarkdownStats("Hello world\nfrom Kairo")).toEqual({
      words: 4,
      characters: 22,
    });
    expect(slugifyHeading("1. Getting Started!")).toBe("1-getting-started");
  });
});
