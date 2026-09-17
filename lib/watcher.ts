/**
 * Pluggable FileSystemWatcher abstraction for external filesystem changes.
 * Can be backed by Rust notify crate or polling in future integrations.
 */

export type FsChangeEvent = {
  type: "create" | "modify" | "delete";
  path: string;
};

export type FsChangeHandler = (event: FsChangeEvent) => void;

export interface FileSystemWatcher {
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  onEvent(handler: FsChangeHandler): () => void;
}

class PluggableFileSystemWatcher implements FileSystemWatcher {
  private watchedPaths = new Set<string>();
  private handlers = new Set<FsChangeHandler>();

  async watch(path: string): Promise<void> {
    this.watchedPaths.add(path);
  }

  async unwatch(path: string): Promise<void> {
    this.watchedPaths.delete(path);
  }

  onEvent(handler: FsChangeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  notify(event: FsChangeEvent): void {
    this.handlers.forEach((h) => {
      try {
        h(event);
      } catch (err) {
        console.error("[PluggableFileSystemWatcher] Handler error:", err);
      }
    });
  }

  getWatchedPaths(): string[] {
    return Array.from(this.watchedPaths);
  }
}

export const fsWatcher = new PluggableFileSystemWatcher();

