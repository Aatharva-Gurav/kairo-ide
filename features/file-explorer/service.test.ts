import { describe, it, expect, beforeEach } from "vitest";
import { FileExplorerService } from "./service";
import { ExplorerHistoryService } from "./history.service";
import { directoryCache } from "./cache";
import { FileSystemNode, ExplorerSortConfig } from "./types";

describe("FileExplorerService", () => {
  beforeEach(() => {
    directoryCache.clear();
  });

  describe("Validation & Safety Guards", () => {
    it("validates filename and throws on invalid names", async () => {
      await expect(
        FileExplorerService.createFile("C:/Projects/App", "invalid/name.ts")
      ).rejects.toThrow("Name cannot contain");
      await expect(
        FileExplorerService.createFile("C:/Projects/App", "")
      ).rejects.toThrow("Name cannot be empty");
      await expect(
        FileExplorerService.createFile("C:/Projects/App", "con")
      ).rejects.toThrow("reserved system name");
    });

    it("validates directory name and throws on invalid names", async () => {
      await expect(
        FileExplorerService.createDirectory("C:/Projects/App", "bad*dir")
      ).rejects.toThrow("Name cannot contain");
      await expect(
        FileExplorerService.createDirectory("C:/Projects/App", ".")
      ).rejects.toThrow('Name cannot be "." or ".."');
    });

    it("prevents copying or moving a directory into itself or descendant", async () => {
      await expect(
        FileExplorerService.copy("C:/Projects/App", "C:/Projects/App/src")
      ).rejects.toThrow("Cannot copy a directory into itself");

      await expect(
        FileExplorerService.move("C:/Projects/App", "C:/Projects/App/src")
      ).rejects.toThrow("Cannot move a directory into itself");
    });
  });

  describe("Sorting Modes", () => {
    const testNodes: FileSystemNode[] = [
      {
        id: "1",
        name: "index.ts",
        path: "C:/App/index.ts",
        type: "file",
        fileExtension: "ts",
      },
      {
        id: "2",
        name: "components",
        path: "C:/App/components",
        type: "directory",
      },
      {
        id: "3",
        name: "styles.css",
        path: "C:/App/styles.css",
        type: "file",
        fileExtension: "css",
      },
      {
        id: "4",
        name: "app.ts",
        path: "C:/App/app.ts",
        type: "file",
        fileExtension: "ts",
      },
      {
        id: "5",
        name: "assets",
        path: "C:/App/assets",
        type: "directory",
      },
    ];

    it("sorts with folders-first", () => {
      const config: ExplorerSortConfig = {
        mode: "folders-first",
        caseSensitive: false,
      };
      const sorted = FileExplorerService.sortNodes(testNodes, config);
      expect(sorted.map((n) => n.name)).toEqual([
        "assets",
        "components",
        "app.ts",
        "index.ts",
        "styles.css",
      ]);
    });

    it("sorts with files-first", () => {
      const config: ExplorerSortConfig = {
        mode: "files-first",
        caseSensitive: false,
      };
      const sorted = FileExplorerService.sortNodes(testNodes, config);
      expect(sorted.map((n) => n.name)).toEqual([
        "app.ts",
        "index.ts",
        "styles.css",
        "assets",
        "components",
      ]);
    });

    it("sorts with alphabetical mode regardless of type", () => {
      const config: ExplorerSortConfig = {
        mode: "alphabetical",
        caseSensitive: false,
      };
      const sorted = FileExplorerService.sortNodes(testNodes, config);
      expect(sorted.map((n) => n.name)).toEqual([
        "app.ts",
        "assets",
        "components",
        "index.ts",
        "styles.css",
      ]);
    });

    it("sorts with type-based mode", () => {
      const config: ExplorerSortConfig = {
        mode: "type-based",
        caseSensitive: false,
      };
      const sorted = FileExplorerService.sortNodes(testNodes, config);
      // Folders first, then css, then ts
      expect(sorted.map((n) => n.name)).toEqual([
        "assets",
        "components",
        "styles.css",
        "app.ts",
        "index.ts",
      ]);
    });
  });

  describe("Filtering Hierarchy", () => {
    const tree: FileSystemNode[] = [
      {
        id: "root/src",
        name: "src",
        path: "C:/App/src",
        type: "directory",
        children: [
          {
            id: "root/src/components",
            name: "components",
            path: "C:/App/src/components",
            type: "directory",
            children: [
              {
                id: "root/src/components/Button.tsx",
                name: "Button.tsx",
                path: "C:/App/src/components/Button.tsx",
                type: "file",
                fileExtension: "tsx",
              },
              {
                id: "root/src/components/Input.tsx",
                name: "Input.tsx",
                path: "C:/App/src/components/Input.tsx",
                type: "file",
                fileExtension: "tsx",
              },
            ],
          },
          {
            id: "root/src/index.ts",
            name: "index.ts",
            path: "C:/App/src/index.ts",
            type: "file",
            fileExtension: "ts",
          },
        ],
      },
      {
        id: "root/package.json",
        name: "package.json",
        path: "C:/App/package.json",
        type: "file",
        fileExtension: "json",
      },
    ];

    it("returns all nodes when query is empty", () => {
      const { filteredNodes, matchingCount } = FileExplorerService.filterTree(tree, "");
      expect(filteredNodes).toEqual(tree);
      expect(matchingCount).toBe(2);
    });

    it("filters and keeps ancestor directories of matched files", () => {
      const { filteredNodes, matchingCount } = FileExplorerService.filterTree(tree, "Button");
      expect(matchingCount).toBe(1);
      expect(filteredNodes.length).toBe(1);
      expect(filteredNodes[0].name).toBe("src");
      expect(filteredNodes[0].isExpanded).toBe(true);

      const subDir = filteredNodes[0].children![0];
      expect(subDir.name).toBe("components");
      expect(subDir.isExpanded).toBe(true);
      expect(subDir.children!.length).toBe(1);
      expect(subDir.children![0].name).toBe("Button.tsx");
    });

    it("returns empty array and zero count when no files match", () => {
      const { filteredNodes, matchingCount } = FileExplorerService.filterTree(tree, "nonexistent");
      expect(filteredNodes.length).toBe(0);
      expect(matchingCount).toBe(0);
    });
  });

  describe("DirectoryCache", () => {
    it("caches entries and invalidates on demand", () => {
      const dir = "C:/Projects/CachedDir";
      const sampleNodes: FileSystemNode[] = [
        { id: "1", name: "test.txt", path: "C:/Projects/CachedDir/test.txt", type: "file" },
      ];

      expect(directoryCache.get(dir)).toBeNull();
      directoryCache.set(dir, sampleNodes);
      expect(directoryCache.get(dir)).toEqual(sampleNodes);

      directoryCache.invalidate(dir);
      expect(directoryCache.get(dir)).toBeNull();
    });

    it("invalidates parent directory when child path is modified", () => {
      const parentDir = "C:/Projects/ParentDir";
      const childFile = "C:/Projects/ParentDir/child.ts";
      const sampleNodes: FileSystemNode[] = [
        { id: "1", name: "child.ts", path: childFile, type: "file" },
      ];

      directoryCache.set(parentDir, sampleNodes);
      expect(directoryCache.get(parentDir)).toEqual(sampleNodes);

      directoryCache.invalidateParent(childFile);
      expect(directoryCache.get(parentDir)).toBeNull();
    });
  });

  describe("normalizeSelection", () => {
    it("filters out descendant files when their ancestor folder is also selected", () => {
      const items: FileSystemNode[] = [
        { id: "1", name: "src", path: "C:/App/src", type: "directory" },
        { id: "2", name: "Button.tsx", path: "C:/App/src/Button.tsx", type: "file" },
        { id: "3", name: "Modal.tsx", path: "C:/App/src/components/Modal.tsx", type: "file" },
        { id: "4", name: "package.json", path: "C:/App/package.json", type: "file" },
      ];

      const normalized = FileExplorerService.normalizeSelection(items);
      expect(normalized.map((n) => n.path)).toEqual([
        "C:/App/src",
        "C:/App/package.json",
      ]);
    });

    it("keeps independent sibling items intact", () => {
      const items: FileSystemNode[] = [
        { id: "1", name: "Button.tsx", path: "C:/App/src/Button.tsx", type: "file" },
        { id: "2", name: "Modal.tsx", path: "C:/App/src/Modal.tsx", type: "file" },
        { id: "3", name: "components", path: "C:/App/src/components", type: "directory" },
      ];

      const normalized = FileExplorerService.normalizeSelection(items);
      expect(normalized.length).toBe(3);
    });
  });

  describe("Batch Rename Preview", () => {
    const candidates: FileSystemNode[] = [
      { id: "1", name: "component-one.tsx", path: "C:/App/src/component-one.tsx", type: "file" },
      { id: "2", name: "component-two.tsx", path: "C:/App/src/component-two.tsx", type: "file" },
      { id: "3", name: "component-three.tsx", path: "C:/App/src/component-three.tsx", type: "file" },
    ];

    it("generates find and replace preview with preserved extension", () => {
      const preview = FileExplorerService.generateBatchRenamePreview(candidates, {
        mode: "find-replace",
        find: "component",
        replace: "widget",
        caseSensitive: false,
        prefix: "",
        suffix: "",
        numberingPattern: "{name}_{n}",
        startNumber: 1,
        padZeros: 1,
        preserveExtension: true,
      });

      expect(preview.map((p) => p.newName)).toEqual([
        "widget-one.tsx",
        "widget-two.tsx",
        "widget-three.tsx",
      ]);
      expect(preview.every((p) => !p.hasConflict)).toBe(true);
    });

    it("generates prefix and suffix preview", () => {
      const preview = FileExplorerService.generateBatchRenamePreview(candidates, {
        mode: "prefix-suffix",
        find: "",
        replace: "",
        caseSensitive: false,
        prefix: "v2_",
        suffix: "_beta",
        numberingPattern: "",
        startNumber: 1,
        padZeros: 1,
        preserveExtension: true,
      });

      expect(preview[0].newName).toBe("v2_component-one_beta.tsx");
      expect(preview[1].newName).toBe("v2_component-two_beta.tsx");
    });

    it("generates sequential numbering preview with zero padding", () => {
      const preview = FileExplorerService.generateBatchRenamePreview(candidates, {
        mode: "numbering",
        find: "",
        replace: "",
        caseSensitive: false,
        prefix: "",
        suffix: "",
        numberingPattern: "item_{n}",
        startNumber: 1,
        padZeros: 3,
        preserveExtension: true,
      });

      expect(preview.map((p) => p.newName)).toEqual([
        "item_001.tsx",
        "item_002.tsx",
        "item_003.tsx",
      ]);
    });

    it("detects collisions when two items result in the exact same name", () => {
      const colliding: FileSystemNode[] = [
        { id: "1", name: "apple.txt", path: "C:/App/apple.txt", type: "file" },
        { id: "2", name: "banana.txt", path: "C:/App/banana.txt", type: "file" },
      ];

      const preview = FileExplorerService.generateBatchRenamePreview(colliding, {
        mode: "find-replace",
        find: "banana",
        replace: "apple",
        caseSensitive: false,
        prefix: "",
        suffix: "",
        numberingPattern: "",
        startNumber: 1,
        padZeros: 1,
        preserveExtension: true,
      });

      const conflictItem = preview.find((p) => p.hasConflict);
      expect(conflictItem).toBeDefined();
    });
  });

  describe("ExplorerHistoryService", () => {
    beforeEach(() => {
      ExplorerHistoryService.clear();
    });

    it("tracks undo and redo state correctly", () => {
      expect(ExplorerHistoryService.canUndo()).toBe(false);
      expect(ExplorerHistoryService.canRedo()).toBe(false);

      ExplorerHistoryService.record({
        type: "rename",
        description: 'Rename "foo.txt" to "bar.txt"',
        item: {
          oldPath: "C:/App/foo.txt",
          newPath: "C:/App/bar.txt",
          isDirectory: false,
        },
      });

      expect(ExplorerHistoryService.canUndo()).toBe(true);
      expect(ExplorerHistoryService.canRedo()).toBe(false);
      expect(ExplorerHistoryService.getUndoDescription()).toBe('Rename "foo.txt" to "bar.txt"');

      ExplorerHistoryService.clear();
      expect(ExplorerHistoryService.canUndo()).toBe(false);
      expect(ExplorerHistoryService.canRedo()).toBe(false);
    });

    it("returns null when attempting to undo on an empty stack", async () => {
      const res = await ExplorerHistoryService.undo();
      expect(res).toBeNull();
    });
  });
});

