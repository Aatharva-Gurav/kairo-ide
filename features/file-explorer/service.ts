import {
  invokeCommand,
  normalizePath,
  joinPath,
  validateFileName,
  isDescendant,
  getFileExtension,
  dirname,
  revealInFileManager,
} from "@/lib/tauri-ipc";
import { FileSystemNode, ExplorerSortConfig } from "./types";
import { directoryCache } from "./cache";

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
   */
  static async bulkCopy(nodes: FileSystemNode[], destDirPath: string): Promise<string[]> {
    const results: string[] = [];
    for (const node of nodes) {
      const dest = await this.copy(node.path, destDirPath);
      results.push(dest);
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

    if (normSrc === destPath) {
      return destPath;
    }

    await invokeCommand<void>("fs_move", {
      srcPath: normSrc,
      destPath,
    });

    directoryCache.invalidateParent(normSrc);
    directoryCache.invalidate(normDestDir);
    return destPath;
  }

  /**
   * Bulk move of multiple files or directories into a destination directory.
   */
  static async bulkMove(nodes: FileSystemNode[], destDirPath: string): Promise<string[]> {
    const results: string[] = [];
    for (const node of nodes) {
      const dest = await this.move(node.path, destDirPath);
      results.push(dest);
    }
    return results;
  }

  /**
   * Duplicates a file in place.
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
   * Reveals a file or directory in native OS file manager.
   */
  static async reveal(path: string): Promise<void> {
    await revealInFileManager(path);
  }
}
