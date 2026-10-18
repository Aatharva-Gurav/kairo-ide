import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyFilter } from "./fuzzy-search";

describe("fuzzyMatch", () => {
  it("scores exact match with highest score", () => {
    const res = fuzzyMatch("Save", "Save");
    expect(res.matches).toBe(true);
    expect(res.score).toBe(1000);
  });

  it("scores prefix matches higher than internal substrings", () => {
    const prefixRes = fuzzyMatch("format", "Format Document");
    const subRes = fuzzyMatch("doc", "Format Document");

    expect(prefixRes.matches).toBe(true);
    expect(subRes.matches).toBe(true);
    expect(prefixRes.score).toBeGreaterThan(subRes.score);
  });

  it("matches acronyms and word initials", () => {
    const res = fuzzyMatch("fd", "Format Document");
    expect(res.matches).toBe(true);
    expect(res.score).toBeGreaterThan(0);
  });

  it("matches multi-word token queries like 'frm doc'", () => {
    const res = fuzzyMatch("frm doc", "Format Document");
    expect(res.matches).toBe(true);
  });

  it("returns matches=false for non-matching queries", () => {
    const res = fuzzyMatch("xyz123", "Format Document");
    expect(res.matches).toBe(false);
    expect(res.score).toBe(0);
  });

  it("matches empty queries with fallback score", () => {
    const res = fuzzyMatch("", "Anything");
    expect(res.matches).toBe(true);
    expect(res.score).toBe(1);
  });
});

describe("fuzzyFilter", () => {
  interface Item {
    title: string;
    category: string;
  }

  const items: Item[] = [
    { title: "Save Document", category: "editor" },
    { title: "Save All Documents", category: "editor" },
    { title: "Format Document", category: "editor" },
    { title: "Open Folder", category: "workbench" },
    { title: "Close Workspace", category: "workbench" },
  ];

  it("returns all items when query is empty", () => {
    const result = fuzzyFilter(items, "", (i) => [i.title, i.category]);
    expect(result).toHaveLength(items.length);
  });

  it("filters and ranks matches by relevance", () => {
    const result = fuzzyFilter(items, "save", (i) => [i.title, i.category]);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].title).toBe("Save Document");
  });

  it("filters by category", () => {
    const result = fuzzyFilter(items, "workbench", (i) => [i.title, i.category]);
    expect(result).toHaveLength(2);
  });
});

