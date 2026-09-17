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

  console.error("[TauriIPC Error]:", message, rawError);

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
  if (lower.includes("path does not exist") || lower.includes("not found") || lower.includes("cannot find")) {
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

export function getFileExtension(pathOrName: string): string {
  const base = basename(pathOrName);
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return base.slice(lastDot + 1).toLowerCase();
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

/**
 * Invoke a Tauri backend command safely
 */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(formatFsError(error));
    const formatted = formatFsError(error);
    const code = parseFsErrorCode(error);
    throw new FileSystemError(code, formatted);
  }
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
