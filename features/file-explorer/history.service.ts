import { FileExplorerService } from "./service";
import { normalizePath, dirname, basename } from "@/lib/tauri-ipc";
import { ideEvents } from "@/lib/events";

export type HistoryOperationType =
  | "move"
  | "rename"
  | "copy"
  | "create"
  | "batch-rename";

export interface MoveHistoryItem {
  fromPath: string;
  toPath: string;
  isDirectory: boolean;
}

export interface RenameHistoryItem {
  oldPath: string;
  newPath: string;
  isDirectory: boolean;
}

export interface CopyHistoryItem {
  sourcePath: string;
  createdPath: string;
  isDirectory: boolean;
}

export interface CreateHistoryItem {
  createdPath: string;
  isDirectory: boolean;
}

export interface BatchRenameHistoryItem {
  items: Array<{ oldPath: string; newPath: string; isDirectory: boolean }>;
}

export type HistoryEntry =
  | {
      type: "move";
      description: string;
      items: MoveHistoryItem[];
    }
  | {
      type: "rename";
      description: string;
      item: RenameHistoryItem;
    }
  | {
      type: "copy";
      description: string;
      items: CopyHistoryItem[];
    }
  | {
      type: "create";
      description: string;
      item: CreateHistoryItem;
    }
  | {
      type: "batch-rename";
      description: string;
      item: BatchRenameHistoryItem;
    };

export class ExplorerHistoryService {
  private static undoStack: HistoryEntry[] = [];
  private static redoStack: HistoryEntry[] = [];
  private static maxHistory = 30;

  static record(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Clear redo stack on new operation
    this.redoStack = [];
  }

  static canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  static canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  static getUndoDescription(): string | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1].description;
  }

  static getRedoDescription(): string | null {
    if (this.redoStack.length === 0) return null;
    return this.redoStack[this.redoStack.length - 1].description;
  }

  static async undo(): Promise<string | null> {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    try {
      switch (entry.type) {
        case "move": {
          for (const item of entry.items) {
            const destParent = dirname(item.fromPath);
            await FileExplorerService.move(item.toPath, destParent);
            ideEvents.emit("file:moved", {
              sourcePath: item.toPath,
              destPath: item.fromPath,
              isDirectory: item.isDirectory,
            });
          }
          break;
        }

        case "rename": {
          const oldName = basename(entry.item.oldPath);
          await FileExplorerService.rename(entry.item.newPath, oldName);
          ideEvents.emit("file:renamed", {
            oldPath: entry.item.newPath,
            newPath: entry.item.oldPath,
            isDirectory: entry.item.isDirectory,
          });
          break;
        }

        case "batch-rename": {
          // Reverse order of batch rename
          for (const item of [...entry.item.items].reverse()) {
            const oldName = basename(item.oldPath);
            await FileExplorerService.rename(item.newPath, oldName);
            ideEvents.emit("file:renamed", {
              oldPath: item.newPath,
              newPath: item.oldPath,
              isDirectory: item.isDirectory,
            });
          }
          break;
        }

        case "copy": {
          // Undo copy by deleting the created copies
          for (const item of entry.items) {
            await FileExplorerService.delete(item.createdPath, item.isDirectory);
            ideEvents.emit("file:deleted", {
              path: item.createdPath,
              isDirectory: item.isDirectory,
            });
          }
          break;
        }

        case "create": {
          await FileExplorerService.delete(entry.item.createdPath, entry.item.isDirectory);
          ideEvents.emit("file:deleted", {
            path: entry.item.createdPath,
            isDirectory: entry.item.isDirectory,
          });
          break;
        }
      }

      this.redoStack.push(entry);
      return `Undid ${entry.description}`;
    } catch (err) {
      console.error("[ExplorerHistoryService] Undo failed:", err);
      throw err;
    }
  }

  static async redo(): Promise<string | null> {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    try {
      switch (entry.type) {
        case "move": {
          for (const item of entry.items) {
            const destParent = dirname(item.toPath);
            await FileExplorerService.move(item.fromPath, destParent);
            ideEvents.emit("file:moved", {
              sourcePath: item.fromPath,
              destPath: item.toPath,
              isDirectory: item.isDirectory,
            });
          }
          break;
        }

        case "rename": {
          const newName = basename(entry.item.newPath);
          await FileExplorerService.rename(entry.item.oldPath, newName);
          ideEvents.emit("file:renamed", {
            oldPath: entry.item.oldPath,
            newPath: entry.item.newPath,
            isDirectory: entry.item.isDirectory,
          });
          break;
        }

        case "batch-rename": {
          for (const item of entry.item.items) {
            const newName = basename(item.newPath);
            await FileExplorerService.rename(item.oldPath, newName);
            ideEvents.emit("file:renamed", {
              oldPath: item.oldPath,
              newPath: item.newPath,
              isDirectory: item.isDirectory,
            });
          }
          break;
        }

        case "copy": {
          for (const item of entry.items) {
            const destParent = dirname(item.createdPath);
            await FileExplorerService.copy(item.sourcePath, destParent);
            ideEvents.emit("file:copied", {
              sourcePath: item.sourcePath,
              destPath: item.createdPath,
            });
          }
          break;
        }

        case "create": {
          const parent = dirname(entry.item.createdPath);
          const name = basename(entry.item.createdPath);
          if (entry.item.isDirectory) {
            await FileExplorerService.createDirectory(parent, name);
          } else {
            await FileExplorerService.createFile(parent, name);
          }
          ideEvents.emit("file:created", {
            path: entry.item.createdPath,
            name,
            isDirectory: entry.item.isDirectory,
          });
          break;
        }
      }

      this.undoStack.push(entry);
      return `Redid ${entry.description}`;
    } catch (err) {
      console.error("[ExplorerHistoryService] Redo failed:", err);
      throw err;
    }
  }

  static clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

