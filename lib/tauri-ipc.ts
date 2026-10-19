/**
 * Tauri IPC abstraction layer and cross-platform path utilities.
 * Isolates all Tauri invocation behind a secure boundary.
 */

import { invoke } from "@tauri-apps/api/core";

export function isTauriEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

export type FileSystemErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "ALREADY_EXISTS"
  | "INVALID_PATH"
  | "NOT_DIRECTORY"
  | "LOCKED"
  | "DESCENDANT_OPERATION"
  | "UNKNOWN";

export class FileSystemError extends Error {
  constructor(
    public code: FileSystemErrorCode,
    message: string,
    public path?: string
  ) {
    super(message);
    this.name = "FileSystemError";
  }
}

export function parseFsErrorCode(rawError: unknown): FileSystemErrorCode {
  const message = typeof rawError === "string" ? rawError : (rawError as Error)?.message || "";
  const lower = message.toLowerCase();

  if (lower.includes("already exists")) return "ALREADY_EXISTS";
  if (lower.includes("permission denied") || lower.includes("access is denied")) return "PERMISSION_DENIED";
  if (lower.includes("cannot copy a directory into itself") || lower.includes("cannot move a directory into itself")) return "DESCENDANT_OPERATION";
  if (lower.includes("not found") || lower.includes("does not exist")) return "NOT_FOUND";
  if (lower.includes("not a directory")) return "NOT_DIRECTORY";
  if (lower.includes("locked") || lower.includes("being used by another process")) return "LOCKED";
  if (lower.includes("invalid")) return "INVALID_PATH";
  return "UNKNOWN";
}

/**
 * Human-friendly error translation for filesystem & workspace errors.
 */
export function formatFsError(rawError: unknown): string {
  const message = typeof rawError === "string" ? rawError : (rawError as Error)?.message || "Unknown error";
  const lower = message.toLowerCase();

  if (lower.includes("already exists")) {
    return "An item with this name already exists in the selected location.";
  }
  if (lower.includes("access is denied") || lower.includes("permission denied")) {
    return "Access denied. You do not have sufficient permissions to perform this operation.";
  }
  if (lower.includes("cannot copy a directory into itself") || lower.includes("cannot move a directory into itself")) {
    return "Cannot copy or move a directory into itself or one of its subdirectories.";
  }
  if (
    lower.includes("path does not exist") ||
    lower.includes("file does not exist") ||
    lower.includes("not found") ||
    lower.includes("cannot find")
  ) {
    return "The requested file or directory could not be found.";
  }
  if (lower.includes("is not a directory")) {
    return "The specified path is not a directory.";
  }
  if (lower.includes("being used by another process") || lower.includes("locked")) {
    return "The file is currently locked or in use by another program.";
  }
  if (lower.includes("invalid name") || lower.includes("filename")) {
    return "The specified name contains invalid characters.";
  }

  return message;
}

/**
 * Cross-platform path normalization
 */
export function normalizePath(pathStr: string): string {
  if (!pathStr) return "";
  // Convert Windows backslashes to standard forward slashes for internal consistency
  let normalized = pathStr.replace(/\\+/g, "/");
  // Decode URI components if URL-encoded (e.g. %20 for spaces)
  if (normalized.includes("%")) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // ignore malformed URI encoding
    }
  }
  // Strip URI schema file:// if present
  if (normalized.startsWith("file://")) {
    normalized = normalized.slice(7);
  }
  // Strip leading slash before Windows drive letter, e.g. /C:/ -> C:/
  if (/^\/[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.slice(1);
  }
  // Normalize Windows drive letter to uppercase (e.g. c:/ -> C:/)
  if (/^[a-z]:\//.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  // Remove redundant trailing slashes unless it's root like "C:/" or "/"
  if (normalized.length > 1 && normalized.endsWith("/")) {
    if (!/^[a-zA-Z]:\/$/.test(normalized)) {
      normalized = normalized.slice(0, -1);
    }
  }
  return normalized;
}

export function basename(pathStr: string): string {
  const norm = normalizePath(pathStr);
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] || norm;
}

export function dirname(pathStr: string): string {
  const norm = normalizePath(pathStr);
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  // Check Windows drive root, e.g. "C:/"
  if (lastSlash === 2 && /^[a-zA-Z]:$/.test(norm.slice(0, 2))) {
    return norm.slice(0, 3);
  }
  return norm.slice(0, lastSlash);
}

export function joinPath(base: string, ...parts: string[]): string {
  let result = normalizePath(base);
  for (const part of parts) {
    const cleanPart = normalizePath(part).replace(/^\/+/, "");
    if (!cleanPart) continue;
    if (result.endsWith("/")) {
      result += cleanPart;
    } else {
      result += "/" + cleanPart;
    }
  }
  return result;
}

export function relativePath(fromPath: string, toPath: string): string {
  const fromNorm = normalizePath(fromPath);
  const toNorm = normalizePath(toPath);

  if (fromNorm.toLowerCase() === toNorm.toLowerCase()) return "";

  const prefix = fromNorm.endsWith("/") ? fromNorm : fromNorm + "/";
  if (toNorm.toLowerCase().startsWith(prefix.toLowerCase())) {
    return toNorm.slice(prefix.length);
  }

  return toNorm;
}

export function isDescendant(parentPath: string, childPath: string): boolean {
  const p = normalizePath(parentPath).toLowerCase();
  const c = normalizePath(childPath).toLowerCase();
  if (p === c) return true;
  return c.startsWith(p.endsWith("/") ? p : p + "/");
}

/**
 * Filters out redundant descendant items from a selection list
 * when an ancestor item is already present in the selection.
 */
export function normalizeSelection<T extends { path: string }>(items: T[]): T[] {
  if (!items || !Array.isArray(items) || items.length <= 1) return items || [];
  return items.filter((item) => {
    const itemNorm = normalizePath(item.path);
    return !items.some((other) => {
      const otherNorm = normalizePath(other.path);
      return otherNorm !== itemNorm && isDescendant(otherNorm, itemNorm);
    });
  });
}

/**
 * Copies text string to clipboard safely across platforms
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
  }
  return false;
}

export function getFileExtension(pathOrName: string): string {
  const base = basename(pathOrName);
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return base.slice(lastDot + 1).toLowerCase();
}

export const ALL_IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "tiff",
  "tif",
  "avif",
  "apng",
  "heic",
  "heif",
  "jfif",
  "pjpeg",
  "pjp",
  "cur",
];

export function isImageFile(pathOrName: string): boolean {
  const ext = getFileExtension(pathOrName).toLowerCase();
  return ALL_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Validates a filename against OS-illegal characters and reserved names.
 */
export function validateFileName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Name cannot be empty." };
  }
  const trimmed = name.trim();
  // Illegal characters on Windows / macOS / Linux: \ / : * ? " < > |
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return { valid: false, error: 'Name cannot contain any of the following characters: \\ / : * ? " < > |' };
  }
  if (trimmed === "." || trimmed === "..") {
    return { valid: false, error: 'Name cannot be "." or ".."' };
  }
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  if (reserved.test(trimmed)) {
    return { valid: false, error: `"${trimmed}" is a reserved system name.` };
  }
  return { valid: true };
}

// In-browser virtual filesystem for web/dev environments
const VFS_STORAGE_KEY = "kairo:vfs_files";
let memoryVfs: Map<string, { content: string; modifiedAt: number }> | null = null;

function getVfs(): Map<string, { content: string; modifiedAt: number }> {
  if (!memoryVfs) {
    memoryVfs = new Map<string, { content: string; modifiedAt: number }>();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(VFS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          for (const [k, v] of Object.entries(parsed)) {
            memoryVfs.set(normalizePath(k), v as { content: string; modifiedAt: number });
          }
        }
      } catch {
        // ignore storage errors
      }
    }
  }
  return memoryVfs;
}

function persistVfs(): void {
  if (typeof window !== "undefined" && window.localStorage && memoryVfs) {
    try {
      const obj: Record<string, { content: string; modifiedAt: number }> = {};
      memoryVfs.forEach((v, k) => {
        obj[k] = v;
      });
      window.localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore storage quota errors
    }
  }
}

async function handleBrowserVfsCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const vfs = getVfs();

  switch (command) {
    case "fs_read_file": {
      const p = normalizePath(String(args?.path || ""));
      const entry = vfs.get(p);
      if (entry) {
        return {
          content: entry.content,
          isBinary: false,
          size: entry.content.length,
          readonly: false,
        } as T;
      }
      return {
        content: "",
        isBinary: false,
        size: 0,
        readonly: false,
      } as T;
    }

    case "fs_write_file": {
      const p = normalizePath(String(args?.path || ""));
      const content = String(args?.content ?? "");
      vfs.set(p, { content, modifiedAt: Date.now() });
      persistVfs();
      return undefined as T;
    }

    case "fs_exists": {
      const p = normalizePath(String(args?.path || ""));
      if (vfs.has(p)) return true as T;
      const prefix = p.endsWith("/") ? p : p + "/";
      for (const k of vfs.keys()) {
        if (k.startsWith(prefix)) return true as T;
      }
      return false as T;
    }

    case "fs_read_directory": {
      const dirPath = normalizePath(String(args?.path || ""));
      const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
      const entries: Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        size?: number;
        modifiedAt?: number;
      }> = [];
      const seenDirs = new Set<string>();

      for (const [filePath, fileData] of vfs.entries()) {
        if (filePath.startsWith(prefix)) {
          const rel = filePath.slice(prefix.length);
          const parts = rel.split("/");
          if (parts.length === 1) {
            // Direct file child
            entries.push({
              name: parts[0],
              path: filePath,
              isDirectory: false,
              size: fileData.content.length,
              modifiedAt: fileData.modifiedAt,
            });
          } else {
            // Subdirectory
            const dirName = parts[0];
            const subDirPath = prefix + dirName;
            if (!seenDirs.has(subDirPath)) {
              seenDirs.add(subDirPath);
              entries.push({
                name: dirName,
                path: subDirPath,
                isDirectory: true,
              });
            }
          }
        }
      }
      return entries as T;
    }

    case "fs_create_file": {
      const p = normalizePath(String(args?.path || ""));
      if (!vfs.has(p)) {
        vfs.set(p, { content: "", modifiedAt: Date.now() });
        persistVfs();
      }
      return undefined as T;
    }

    case "fs_create_directory": {
      // Directories are implicit in VFS
      return undefined as T;
    }

    case "fs_rename": {
      const oldPath = normalizePath(String(args?.oldPath || args?.old_path || ""));
      const newPath = normalizePath(String(args?.newPath || args?.new_path || ""));
      const oldVal = vfs.get(oldPath);
      if (oldVal) {
        vfs.delete(oldPath);
        vfs.set(newPath, oldVal);
      }
      const prefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
      const newPrefix = newPath.endsWith("/") ? newPath : newPath + "/";
      for (const [k, v] of Array.from(vfs.entries())) {
        if (k.startsWith(prefix)) {
          vfs.delete(k);
          vfs.set(newPrefix + k.slice(prefix.length), v);
        }
      }
      persistVfs();
      return undefined as T;
    }

    case "fs_delete": {
      const p = normalizePath(String(args?.path || ""));
      vfs.delete(p);
      const prefix = p.endsWith("/") ? p : p + "/";
      for (const k of Array.from(vfs.keys())) {
        if (k.startsWith(prefix)) {
          vfs.delete(k);
        }
      }
      persistVfs();
      return undefined as T;
    }

    case "fs_copy": {
      const src = normalizePath(String(args?.srcPath || args?.src_path || ""));
      const dest = normalizePath(String(args?.destPath || args?.dest_path || ""));
      const srcVal = vfs.get(src);
      if (srcVal) {
        vfs.set(dest, { content: srcVal.content, modifiedAt: Date.now() });
      }
      persistVfs();
      return undefined as T;
    }

    case "fs_move": {
      const src = normalizePath(String(args?.srcPath || args?.src_path || ""));
      const dest = normalizePath(String(args?.destPath || args?.dest_path || ""));
      const srcVal = vfs.get(src);
      if (srcVal) {
        vfs.delete(src);
        vfs.set(dest, { content: srcVal.content, modifiedAt: Date.now() });
      }
      persistVfs();
      return undefined as T;
    }

    case "fs_duplicate": {
      const src = normalizePath(String(args?.srcPath || args?.src_path || ""));
      const srcVal = vfs.get(src);
      const dest = src + " copy";
      if (srcVal) {
        vfs.set(dest, { content: srcVal.content, modifiedAt: Date.now() });
      }
      persistVfs();
      return dest as T;
    }

    case "fs_get_metadata": {
      const p = normalizePath(String(args?.path || ""));
      const fileData = vfs.get(p);
      return {
        name: basename(p),
        path: p,
        isDirectory: !fileData,
        size: fileData?.content.length || 0,
        fileCount: 1,
        folderCount: 0,
        isReadonly: false,
        modifiedAt: fileData?.modifiedAt || Date.now(),
      } as T;
    }

    case "fs_list_workspace_files": {
      const root = normalizePath(String(args?.rootPath || ""));
      const prefix = root.endsWith("/") ? root : root + "/";
      const files: string[] = [];
      for (const k of vfs.keys()) {
        if (k.startsWith(prefix)) {
          files.push(k);
        }
      }
      return files as T;
    }

    case "fs_search_workspace": {
      const root = normalizePath(String(args?.rootPath || ""));
      const query = String(args?.query || "").toLowerCase();
      const prefix = root.endsWith("/") ? root : root + "/";
      const matches: Array<{
        filePath: string;
        lineNumber: number;
        column: number;
        matchLength: number;
        lineContent: string;
      }> = [];

      for (const [k, v] of vfs.entries()) {
        if (k.startsWith(prefix) && query) {
          const lines = v.content.split("\n");
          lines.forEach((line, lineIdx) => {
            let col = line.toLowerCase().indexOf(query);
            while (col !== -1) {
              matches.push({
                filePath: k,
                lineNumber: lineIdx + 1,
                column: col + 1,
                matchLength: query.length,
                lineContent: line,
              });
              col = line.toLowerCase().indexOf(query, col + 1);
            }
          });
        }
      }
      return matches as T;
    }

    case "fs_replace_in_files": {
      const replacements = (args?.replacements || []) as Array<{
        filePath: string;
        lineNumber: number;
        column: number;
        matchLength: number;
        replacement: string;
      }>;
      const modifiedFiles = new Set<string>();
      let occurrences = 0;

      for (const r of replacements) {
        const p = normalizePath(r.filePath);
        const entry = vfs.get(p);
        if (entry) {
          const lines = entry.content.split("\n");
          if (r.lineNumber <= lines.length) {
            const line = lines[r.lineNumber - 1];
            const before = line.slice(0, r.column - 1);
            const after = line.slice(r.column - 1 + r.matchLength);
            lines[r.lineNumber - 1] = before + r.replacement + after;
            entry.content = lines.join("\n");
            entry.modifiedAt = Date.now();
            modifiedFiles.add(p);
            occurrences++;
          }
        }
      }
      persistVfs();
      return {
        filesModified: modifiedFiles.size,
        occurrencesReplaced: occurrences,
      } as T;
    }

    case "workspace_validate_path":
      return true as T;

    case "workspace_detect_project":
      return ["typescript", "web"] as T;

    case "workspace_pick_folder":
    case "workspace_pick_file":
    case "workspace_save_file_as":
      return null as T;

    case "fs_reveal":
    case "menu_popup":
    case "menu_sync_recent_workspaces":
    case "window_minimize":
    case "window_toggle_maximize":
    case "window_close":
    case "window_set_theme":
      return undefined as T;

    case "window_is_maximized":
      return false as T;

    default:
      return undefined as T;
  }
}

/**
 * Invoke a Tauri backend command safely with automatic web/browser virtual FS fallback.
 */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      const errStr = String(error || "");
      if (
        errStr.includes("__TAURI_INTERNALS__") ||
        (errStr.toLowerCase().includes("command") && errStr.toLowerCase().includes("not found"))
      ) {
        return handleBrowserVfsCommand<T>(command, args);
      }
      throw new Error(formatFsError(error));
    }
  }

  return handleBrowserVfsCommand<T>(command, args);
}

/**
 * Reveals a file or directory in native OS file manager (Explorer/Finder/xdg-open)
 */
export async function revealInFileManager(pathStr: string): Promise<void> {
  const norm = normalizePath(pathStr);
  await invokeCommand<void>("fs_reveal", { path: norm });
}

/**
 * Checks if a path exists via Tauri backend
 */
export async function pathExists(pathStr: string): Promise<boolean> {
  const norm = normalizePath(pathStr);
  return await invokeCommand<boolean>("fs_exists", { path: norm });
}

export interface DetailedMetadata {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  fileCount: number;
  folderCount: number;
  isReadonly: boolean;
  createdAt?: number;
  modifiedAt?: number;
}

/**
 * Retrieves detailed file or folder metadata (size, file/folder counts, dates)
 */
export async function getDetailedMetadata(pathStr: string): Promise<DetailedMetadata> {
  const norm = normalizePath(pathStr);
  return await invokeCommand<DetailedMetadata>("fs_get_metadata", { path: norm });
}

export interface FileContentResult {
  content: string;
  isBinary: boolean;
  size: number;
  readonly: boolean;
}

export interface SearchQueryOptions {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegex: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  maxResults?: number;
}

export interface WorkspaceSearchMatch {
  filePath: string;
  lineNumber: number;
  column: number;
  matchLength: number;
  lineContent: string;
}

export interface FileReplacementPayload {
  filePath: string;
  lineNumber: number;
  column: number;
  matchLength: number;
  replacement: string;
}

export interface ReplaceSummary {
  filesModified: number;
  occurrencesReplaced: number;
}

/**
 * Reads file content safely from the filesystem via Tauri backend.
 */
export async function readFileContent(pathStr: string): Promise<FileContentResult> {
  const norm = normalizePath(pathStr);
  return await invokeCommand<FileContentResult>("fs_read_file", { path: norm });
}

/**
 * Writes file content safely to the filesystem via Tauri backend.
 */
export async function writeFileContent(pathStr: string, content: string): Promise<void> {
  const norm = normalizePath(pathStr);
  await invokeCommand<void>("fs_write_file", { path: norm, content });
}

/**
 * Searches the workspace files for text matches using native backend engine.
 */
export async function searchWorkspaceFiles(
  rootPath: string,
  query: string,
  options: SearchQueryOptions
): Promise<WorkspaceSearchMatch[]> {
  const normRoot = normalizePath(rootPath);
  return await invokeCommand<WorkspaceSearchMatch[]>("fs_search_workspace", {
    rootPath: normRoot,
    query,
    options,
  });
}

/**
 * Executes batch replacements across workspace files via Tauri backend.
 */
export async function replaceInWorkspaceFiles(
  replacements: FileReplacementPayload[]
): Promise<ReplaceSummary> {
  return await invokeCommand<ReplaceSummary>("fs_replace_in_files", {
    replacements: replacements.map((r) => ({
      ...r,
      filePath: normalizePath(r.filePath),
    })),
  });
}

/**
 * Lists all project files for fast Quick Open navigation.
 */
export async function listWorkspaceFiles(
  rootPath: string,
  maxFiles?: number
): Promise<string[]> {
  const normRoot = normalizePath(rootPath);
  const files = await invokeCommand<string[]>("fs_list_workspace_files", {
    rootPath: normRoot,
    maxFiles,
  });
  return files.map(normalizePath);
}

/**
 * Formats a byte number into human-readable string (e.g. 1.25 MB).
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

