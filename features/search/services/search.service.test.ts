import { describe, it, expect, vi } from "vitest";
import { SearchService } from "./search.service";
import * as tauriIpc from "@/lib/tauri-ipc";

describe("SearchService", () => {
  it("parses comma- and semicolon-separated patterns correctly", () => {
    expect(SearchService.parsePatterns("*.ts, src/**; test/*")).toEqual([
      "*.ts",
      "src/**",
      "test/*",
    ]);
    expect(SearchService.parsePatterns("")).toEqual([]);
    expect(SearchService.parsePatterns("   ")).toEqual([]);
  });

  it("aggregates and groups search matches by file properly", async () => {
    vi.spyOn(tauriIpc, "searchWorkspaceFiles").mockResolvedValueOnce([
      {
        filePath: "C:/projects/app/src/index.ts",
        lineNumber: 10,
        column: 5,
        matchLength: 4,
        lineContent: "let user = 'John';",
      },
      {
        filePath: "C:/projects/app/src/index.ts",
        lineNumber: 15,
        column: 12,
        matchLength: 4,
        lineContent: "console.log(user);",
      },
      {
        filePath: "C:/projects/app/package.json",
        lineNumber: 2,
        column: 11,
        matchLength: 4,
        lineContent: '"name": "user-app",',
      },
    ]);

    const results = await SearchService.search("C:/projects/app", "user", {
      isCaseSensitive: false,
      isWholeWord: false,
      isRegex: false,
      includePattern: "",
      excludePattern: "",
    });

    expect(results.length).toBe(2);

    const indexFile = results.find((r) => r.fileName === "index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.matches.length).toBe(2);

    const pkgFile = results.find((r) => r.fileName === "package.json");
    expect(pkgFile).toBeDefined();
    expect(pkgFile!.matches.length).toBe(1);
  });

  it("returns empty array for empty search queries without calling backend", async () => {
    const spy = vi.spyOn(tauriIpc, "searchWorkspaceFiles");
    const results = await SearchService.search("C:/projects/app", "  ", {
      isCaseSensitive: false,
      isWholeWord: false,
      isRegex: false,
      includePattern: "",
      excludePattern: "",
    });

    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("validates regular expressions when regex option is enabled", async () => {
    await expect(
      SearchService.search("C:/projects/app", "[unclosed-class", {
        isCaseSensitive: false,
        isWholeWord: false,
        isRegex: true,
        includePattern: "",
        excludePattern: "",
      })
    ).rejects.toThrow("Invalid regular expression");
  });

  it("sorts replacements descending bottom-to-top and right-to-left", async () => {
    const spy = vi.spyOn(tauriIpc, "replaceInWorkspaceFiles").mockResolvedValueOnce({
      filesModified: 1,
      occurrencesReplaced: 2,
    });

    await SearchService.replaceAll([
      {
        filePath: "C:/app/file.ts",
        lineNumber: 5,
        column: 10,
        matchLength: 3,
        replacement: "abc",
      },
      {
        filePath: "C:/app/file.ts",
        lineNumber: 10,
        column: 2,
        matchLength: 3,
        replacement: "abc",
      },
      {
        filePath: "C:/app/file.ts",
        lineNumber: 5,
        column: 20,
        matchLength: 3,
        replacement: "abc",
      },
    ]);

    expect(spy).toHaveBeenCalled();
    const passed = spy.mock.calls[0][0];
    // First should be line 10
    expect(passed[0].lineNumber).toBe(10);
    // Next should be line 5 column 20
    expect(passed[1].lineNumber).toBe(5);
    expect(passed[1].column).toBe(20);
    // Next should be line 5 column 10
    expect(passed[2].lineNumber).toBe(5);
    expect(passed[2].column).toBe(10);
  });
});
