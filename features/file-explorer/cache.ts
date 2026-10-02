import { FileSystemNode } from "./types";
import { normalizePath, dirname } from "@/lib/tauri-ipc";

interface CacheEntry {
  entries: FileSystemNode[];
  timestamp: number;
}

export class DirectoryCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(ttlMs = 30000) {
    this.ttlMs = ttlMs;
  }

  get(dirPath: string): FileSystemNode[] | null {
    const key = normalizePath(dirPath).toLowerCase();
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Invalidate if older than TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.entries;
  }

  set(dirPath: string, entries: FileSystemNode[]): void {
    const key = normalizePath(dirPath).toLowerCase();
    this.cache.set(key, {
      entries,
      timestamp: Date.now(),
    });
  }

  invalidate(dirPath: string): void {
    const key = normalizePath(dirPath).toLowerCase();
    this.cache.delete(key);
  }

  invalidateParent(childPath: string): void {
    const parent = dirname(childPath);
    this.invalidate(parent);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const directoryCache = new DirectoryCache();

