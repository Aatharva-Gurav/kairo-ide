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
});

