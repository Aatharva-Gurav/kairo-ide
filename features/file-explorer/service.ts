import {
  invokeCommand,
  normalizePath,
  joinPath,
  validateFileName,
  isDescendant,
  getFileExtension,
  dirname,
  basename,
  revealInFileManager,
  writeFileContent,
  normalizeSelection,
  getDetailedMetadata,
} from "@/lib/tauri-ipc";
import {
  FileSystemNode,
  ExplorerSortConfig,
  BatchRenameRule,
  BatchRenamePreviewItem,
  ItemProperties,
} from "./types";
import { directoryCache } from "./cache";
import { ExplorerHistoryService } from "./history.service";

interface TauriFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export const DEFAULT_EXCLUSIONS = new Set([
  "node_modules",
  ".git",
  ".next",
  "target",
  "dist",
  "build",
]);

export class FileExplorerService {
  /**
   * Reads a directory from the filesystem via Tauri backend with caching.
   */
  static async readDirectory(
    dirPath: string,
    showHidden = false,
    useCache = true
  ): Promise<FileSystemNode[]> {
    const norm = normalizePath(dirPath);

    if (useCache) {
      const cached = directoryCache.get(norm);
      if (cached) return cached;
    }

    const rawEntries = await invokeCommand<TauriFileEntry[]>("fs_read_directory", {
      path: norm,
      showHidden,
    });

    const nodes: FileSystemNode[] = rawEntries.map((entry) => {
      const entryNorm = normalizePath(entry.path);
      const ext = entry.isDirectory ? undefined : getFileExtension(entry.name);
      return {
        id: entryNorm,
        name: entry.name,
        path: entryNorm,
        parentPath: norm,
        type: entry.isDirectory ? ("directory" as const) : ("file" as const),
        children: entry.isDirectory ? [] : undefined,
        isExpanded: false,
        isLoading: false,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
        fileExtension: ext,
      };
    });

    directoryCache.set(norm, nodes);
    return nodes;
  }

  /**
   * Sorts nodes based on user configuration.
   */
  static sortNodes(nodes: FileSystemNode[], config: ExplorerSortConfig): FileSystemNode[] {
    return [...nodes].sort((a, b) => {
      const nameA = config.caseSensitive ? a.name : a.name.toLowerCase();
      const nameB = config.caseSensitive ? b.name : b.name.toLowerCase();

      switch (config.mode) {
        case "folders-first": {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return nameA.localeCompare(nameB);
        }
        case "files-first": {
          if (a.type !== b.type) {
            return a.type === "file" ? -1 : 1;
          }
          return nameA.localeCompare(nameB);
        }
        case "type-based": {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          if (a.type === "file") {
            const extA = (a.fileExtension || "").toLowerCase();
            const extB = (b.fileExtension || "").toLowerCase();
            if (extA !== extB) {
              return extA.localeCompare(extB);
            }
          }
          return nameA.localeCompare(nameB);
        }
        case "alphabetical":
        default:
          return nameA.localeCompare(nameB);
      }
    });
  }

  /**
   * Filters tree hierarchy while preserving matching ancestors.
   */
  static filterTree(
    nodes: FileSystemNode[],
    query: string
  ): { filteredNodes: FileSystemNode[]; matchingCount: number } {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return { filteredNodes: nodes, matchingCount: nodes.length };
    }

    let count = 0;

    function filterNode(node: FileSystemNode): FileSystemNode | null {
      const nameMatches = node.name.toLowerCase().includes(cleanQuery);

      if (node.type === "file") {
        if (nameMatches) {
          count++;
          return node;
        }
        return null;
      }

      // For directories, filter children recursively
      const filteredChildren: FileSystemNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const res = filterNode(child);
          if (res) filteredChildren.push(res);
        }
      }

      // If directory matches name or has matching descendants, keep it
      if (nameMatches) {
        count++;
        return {
          ...node,
          isExpanded: true,
          children: node.children,
        };
      }

      if (filteredChildren.length > 0) {
        return {
          ...node,
          isExpanded: true,
          children: filteredChildren,
        };
      }

      return null;
    }

    const filteredNodes = nodes.map(filterNode).filter(Boolean) as FileSystemNode[];
    return { filteredNodes, matchingCount: count };
  }

  /**
   * Creates a new file inside a parent directory.
   */
  static async createFile(parentPath: string, fileName: string): Promise<string> {
    const validation = validateFileName(fileName);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const fullPath = joinPath(parentPath, fileName);
    await invokeCommand<void>("fs_create_file", { path: fullPath });
    directoryCache.invalidate(parentPath);
    return fullPath;
  }

  /**
   * Creates a new directory inside a parent directory.
   */
  static async createDirectory(parentPath: string, dirName: string): Promise<string> {
    const validation = validateFileName(dirName);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const fullPath = joinPath(parentPath, dirName);
    await invokeCommand<void>("fs_create_directory", { path: fullPath });
    directoryCache.invalidate(parentPath);
    return fullPath;
  }

  /**
   * Renames a file or directory.
   */
  static async rename(oldPath: string, newName: string): Promise<string> {
    const validation = validateFileName(newName);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normOld = normalizePath(oldPath);
    const parent = dirname(normOld);
    const newPath = joinPath(parent, newName);

    if (normOld.toLowerCase() === newPath.toLowerCase()) {
      if (normOld === newPath) return normOld;
    }

    await invokeCommand<void>("fs_rename", {
      oldPath: normOld,
      newPath,
    });

    directoryCache.invalidate(parent);
    return newPath;
  }

  /**
   * Deletes a file or directory.
   */
  static async delete(path: string, isDirectory: boolean): Promise<void> {
    const norm = normalizePath(path);
    await invokeCommand<void>("fs_delete", {
      path: norm,
      isDir: isDirectory,
    });
    directoryCache.invalidateParent(norm);
  }

  /**
   * Bulk deletion of multiple files or directories.
   */
  static async bulkDelete(nodes: FileSystemNode[]): Promise<void> {
    for (const node of nodes) {
      await this.delete(node.path, node.type === "directory");
    }
  }

  /**
   * Copies a file or directory into a destination directory.
   */
  static async copy(sourcePath: string, destDirPath: string): Promise<string> {
    const normSrc = normalizePath(sourcePath);
    const normDestDir = normalizePath(destDirPath);

    if (isDescendant(normSrc, normDestDir)) {
      throw new Error("Cannot copy a directory into itself or one of its subdirectories.");
    }

    const srcName = normSrc.split("/").pop() || "item";
    const destPath = joinPath(normDestDir, srcName);

    await invokeCommand<void>("fs_copy", {
      srcPath: normSrc,
      destPath,
    });

    directoryCache.invalidate(normDestDir);
    return destPath;
  }

  /**
   * Bulk copy of multiple files or directories into a destination directory.
   * If copying into the same parent folder, duplicates with non-conflicting names.
   */
  static async bulkCopy(
    nodes: FileSystemNode[],
    destDirPath: string,
    recordHistory = true
  ): Promise<string[]> {
    const normDestDir = normalizePath(destDirPath);
    const normalizedNodes = normalizeSelection(nodes);
    const results: string[] = [];
    const historyItems: Array<{ sourcePath: string; createdPath: string; isDirectory: boolean }> = [];

    for (const node of normalizedNodes) {
      const normSrc = normalizePath(node.path);
      const srcParent = dirname(normSrc);

      // If copying into the same directory, duplicate it instead of overwriting/erroring
      if (normDestDir.toLowerCase() === srcParent.toLowerCase()) {
        const dupPath = await this.duplicate(normSrc);
        results.push(dupPath);
        historyItems.push({
          sourcePath: normSrc,
          createdPath: dupPath,
          isDirectory: node.type === "directory",
        });
      } else {
        const dest = await this.copy(node.path, normDestDir);
        results.push(dest);
        historyItems.push({
          sourcePath: normSrc,
          createdPath: dest,
          isDirectory: node.type === "directory",
        });
      }
    }

    if (recordHistory && historyItems.length > 0) {
      const count = historyItems.length;
      const desc =
        count === 1
          ? `copy: ${basename(historyItems[0].sourcePath)}`
          : `copy of ${count} items`;
      ExplorerHistoryService.record({
        type: "copy",
        description: desc,
        items: historyItems,
      });
    }

    return results;
  }

  /**
   * Moves a file or directory into a destination directory.
   */
  static async move(sourcePath: string, destDirPath: string): Promise<string> {
    const normSrc = normalizePath(sourcePath);
    const normDestDir = normalizePath(destDirPath);

    if (isDescendant(normSrc, normDestDir)) {
      throw new Error("Cannot move a directory into itself or one of its subdirectories.");
    }

    const srcName = normSrc.split("/").pop() || "item";
    const destPath = joinPath(normDestDir, srcName);

    if (normSrc.toLowerCase() === destPath.toLowerCase()) {
      return destPath;
    }

    await invokeCommand<void>("fs_move", {
      srcPath: normSrc,
      destPath,
    });

    directoryCache.clear();
    return destPath;
  }

  /**
   * Normalizes a selection to eliminate redundant descendant items when their ancestor is also selected.
   */
  static normalizeSelection(items: FileSystemNode[]): FileSystemNode[] {
    return normalizeSelection(items);
  }

  /**
   * Bulk move of multiple files or directories into a destination directory.
   */
  static async bulkMove(
    nodes: FileSystemNode[],
    destDirPath: string,
    recordHistory = true
  ): Promise<string[]> {
    const normDestDir = normalizePath(destDirPath);
    const normalizedNodes = normalizeSelection(nodes);
    const results: string[] = [];
    const historyItems: Array<{ fromPath: string; toPath: string; isDirectory: boolean }> = [];

    for (const node of normalizedNodes) {
      const normSrc = normalizePath(node.path);
      const srcParent = dirname(normSrc);

      // Skip if moving into its own direct parent (no-op)
      if (normDestDir.toLowerCase() === srcParent.toLowerCase()) {
        results.push(normSrc);
        continue;
      }

      const dest = await this.move(node.path, normDestDir);
      results.push(dest);
      historyItems.push({
        fromPath: normSrc,
        toPath: dest,
        isDirectory: node.type === "directory",
      });
    }

    if (recordHistory && historyItems.length > 0) {
      const count = historyItems.length;
      const desc =
        count === 1
          ? `move: ${basename(historyItems[0].fromPath)}`
          : `move of ${count} items`;
      ExplorerHistoryService.record({
        type: "move",
        description: desc,
        items: historyItems,
      });
    }

    return results;
  }

  /**
   * Duplicates a file or directory in place.
   */
  static async duplicate(sourcePath: string): Promise<string> {
    const normSrc = normalizePath(sourcePath);
    const newPath = await invokeCommand<string>("fs_duplicate", {
      srcPath: normSrc,
    });
    const parent = dirname(normSrc);
    directoryCache.invalidate(parent);
    return normalizePath(newPath);
  }

  /**
   * Bulk duplicate of multiple files or directories in place.
   */
  static async bulkDuplicate(
    nodes: FileSystemNode[],
    recordHistory = true
  ): Promise<string[]> {
    const normalizedNodes = normalizeSelection(nodes);
    const results: string[] = [];
    const historyItems: Array<{ sourcePath: string; createdPath: string; isDirectory: boolean }> = [];

    for (const node of normalizedNodes) {
      const normSrc = normalizePath(node.path);
      const newPath = await this.duplicate(normSrc);
      results.push(newPath);
      historyItems.push({
        sourcePath: normSrc,
        createdPath: newPath,
        isDirectory: node.type === "directory",
      });
    }

    if (recordHistory && historyItems.length > 0) {
      const count = historyItems.length;
      const desc =
        count === 1
          ? `duplicate: ${basename(historyItems[0].sourcePath)}`
          : `duplicate of ${count} items`;
      ExplorerHistoryService.record({
        type: "copy",
        description: desc,
        items: historyItems,
      });
    }

    return results;
  }

  /**
   * Previews batch rename for a list of nodes based on rules.
   */
  static generateBatchRenamePreview(
    nodes: FileSystemNode[],
    rule: BatchRenameRule
  ): BatchRenamePreviewItem[] {
    const previews: BatchRenamePreviewItem[] = [];
    const usedNames = new Map<string, string>();

    nodes.forEach((node, index) => {
      const parent = dirname(node.path);
      const isDir = node.type === "directory";
      const originalName = node.name;
      let newName = originalName;

      const lastDot = originalName.lastIndexOf(".");
      const hasExtension = lastDot > 0 && !isDir;
      const stem = hasExtension ? originalName.slice(0, lastDot) : originalName;
      const ext = hasExtension ? originalName.slice(lastDot) : "";

      switch (rule.mode) {
        case "find-replace": {
          if (rule.find) {
            if (rule.preserveExtension && hasExtension) {
              const regex = new RegExp(
                rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                rule.caseSensitive ? "g" : "gi"
              );
              const replacedStem = stem.replace(regex, rule.replace);
              newName = replacedStem + ext;
            } else {
              const regex = new RegExp(
                rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                rule.caseSensitive ? "g" : "gi"
              );
              newName = originalName.replace(regex, rule.replace);
            }
          }
          break;
        }

        case "prefix-suffix": {
          const pre = rule.prefix || "";
          const suf = rule.suffix || "";
          if (rule.preserveExtension && hasExtension) {
            newName = `${pre}${stem}${suf}${ext}`;
          } else {
            newName = `${pre}${originalName}${suf}`;
          }
          break;
        }

        case "numbering": {
          const pad = Math.max(1, rule.padZeros || 1);
          const numStr = String((rule.startNumber || 1) + index).padStart(pad, "0");
          let basePattern = rule.numberingPattern || "{name}_{n}";
          if (!basePattern.includes("{n}")) {
            basePattern = `${basePattern}_{n}`;
          }
          const formatted = basePattern
            .replace(/{name}/g, stem)
            .replace(/{n}/g, numStr);

          newName = rule.preserveExtension && hasExtension ? `${formatted}${ext}` : formatted;
          break;
        }
      }

      // Check validity
      const validation = validateFileName(newName);
      let hasConflict = !validation.valid;
      let conflictReason = validation.error;

      // Check duplicate within the batch for the same folder
      const parentKey = `${parent}:::${newName.toLowerCase()}`;
      if (!hasConflict && usedNames.has(parentKey)) {
        hasConflict = true;
        conflictReason = "Duplicate name generated in the same folder.";
      } else {
        usedNames.set(parentKey, node.path);
      }

      previews.push({
        node,
        originalName,
        newName,
        hasConflict,
        conflictReason,
      });
    });

    return previews;
  }

  /**
   * Executes batch rename safely.
   */
  static async executeBatchRename(
    previews: BatchRenamePreviewItem[],
    recordHistory = true
  ): Promise<Array<{ oldPath: string; newPath: string }>> {
    const toRename = previews.filter(
      (p) => !p.hasConflict && p.newName !== p.originalName
    );

    if (toRename.length === 0) return [];

    const executed: Array<{ oldPath: string; newPath: string; isDirectory: boolean }> = [];
    const affectedParents = new Set<string>();

    for (const item of toRename) {
      const oldPath = item.node.path;
      const newPath = await this.rename(oldPath, item.newName);
      affectedParents.add(dirname(oldPath));
      executed.push({
        oldPath: normalizePath(oldPath),
        newPath: normalizePath(newPath),
        isDirectory: item.node.type === "directory",
      });
    }

    if (recordHistory && executed.length > 0) {
      ExplorerHistoryService.record({
        type: "batch-rename",
        description: `batch rename of ${executed.length} items`,
        item: { items: executed },
      });
    }

    return executed.map(({ oldPath, newPath }) => ({ oldPath, newPath }));
  }

  /**
   * Retrieves detailed item properties for the Properties modal.
   */
  static async getItemProperties(target: string | FileSystemNode): Promise<ItemProperties> {
    const norm = typeof target === "string" ? normalizePath(target) : normalizePath(target.path);
    const meta = await getDetailedMetadata(norm);
    return {
      name: meta.name,
      path: norm,
      type: meta.isDirectory ? "directory" : "file",
      size: meta.size,
      fileCount: meta.fileCount,
      folderCount: meta.folderCount,
      isReadonly: meta.isReadonly,
      createdAt: meta.createdAt,
      modifiedAt: meta.modifiedAt,
    };
  }

  /**
   * Reveals a file or directory in native OS file manager.
   */
  static async reveal(path: string): Promise<void> {
    await revealInFileManager(path);
  }

  /**
   * Imports files or folders dropped from the operating system into a project directory.
   * Handles both native desktop Tauri environment (with native file paths)
   * and browser environments (using File and webkitGetAsEntry).
   */
  static async importExternalFiles(
    dataTransfer: DataTransfer,
    destDirPath: string
  ): Promise<string[]> {
    const normDestDir = normalizePath(destDirPath);
    const importedPaths: string[] = [];

    // Helper to recursively process webkit directory entries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processDirectoryEntry = async (dirEntry: any, targetParent: string) => {
      const createdDir = await this.createDirectory(targetParent, dirEntry.name);
      importedPaths.push(createdDir);

      const dirReader = dirEntry.createReader();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readEntries = (): Promise<any[]> =>
        new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));

      let entries = await readEntries();
      while (entries.length > 0) {
        for (const entry of entries) {
          if (entry.isFile) {
            const file: File = await new Promise((resolve, reject) =>
              entry.file(resolve, reject)
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nativePath = (file as any).path;
            if (nativePath) {
              const copied = await this.copy(nativePath, createdDir);
              importedPaths.push(copied);
            } else {
              const content = await file.text();
              const fullPath = joinPath(createdDir, file.name);
              await writeFileContent(fullPath, content);
              importedPaths.push(fullPath);
            }
          } else if (entry.isDirectory) {
            await processDirectoryEntry(entry, createdDir);
          }
        }
        entries = await readEntries();
      }
    };

    // Try webkit entries first if available (supports folders)
    const items = dataTransfer.items;
    let hasWebkitEntries = false;

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry =
          typeof (item as any).webkitGetAsEntry === "function"
            ? (item as any).webkitGetAsEntry()
            : null;
        if (entry) {
          hasWebkitEntries = true;
          if (entry.isDirectory) {
            await processDirectoryEntry(entry, normDestDir);
          } else if (entry.isFile) {
            const file: File = await new Promise((resolve, reject) =>
              entry.file(resolve, reject)
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nativePath = (file as any).path;
            if (nativePath) {
              const copied = await this.copy(nativePath, normDestDir);
              importedPaths.push(copied);
            } else {
              const content = await file.text();
              const fullPath = joinPath(normDestDir, file.name);
              await writeFileContent(fullPath, content);
              importedPaths.push(fullPath);
            }
          }
        }
      }
    }

    // Fallback to standard dataTransfer.files
    if (!hasWebkitEntries && dataTransfer.files && dataTransfer.files.length > 0) {
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nativePath = (file as any).path;
        if (nativePath) {
          const copied = await this.copy(nativePath, normDestDir);
          importedPaths.push(copied);
        } else {
          const content = await file.text();
          const fullPath = joinPath(normDestDir, file.name);
          await writeFileContent(fullPath, content);
          importedPaths.push(fullPath);
        }
      }
    }

    directoryCache.invalidate(normDestDir);
    return importedPaths;
  }
}
