/**
 * IDE Event Bus for decoupled communication between IDE subsystems.
 * Enables future features (Monaco Editor, Git, Terminal, AI Assistant, etc.)
 * to observe and react to Workspace and File Explorer events.
 */

export interface WorkspaceEventPayload {
  id: string;
  name: string;
  rootPath: string;
  roots?: Array<{ id: string; name: string; path: string }>;
  openedAt?: number;
  lastOpenedAt?: number;
  projectTypes?: string[];
}

export interface FileEventPayload {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

export interface FileMovedPayload {
  sourcePath: string;
  destPath: string;
  isDirectory: boolean;
}

export interface FileRenamedPayload {
  oldPath: string;
  newPath: string;
  isDirectory: boolean;
}

export type IDEEventMap = {
  "workspace:opened": WorkspaceEventPayload;
  "workspace:closed": void;
  "workspace:changed": WorkspaceEventPayload;
  "workspace:switched": { from: WorkspaceEventPayload | null; to: WorkspaceEventPayload };

  "file:selected": FileEventPayload;
  "file:open-requested": FileEventPayload;
  "file:open-to-side": FileEventPayload;
  "file:created": FileEventPayload;
  "file:renamed": FileRenamedPayload;
  "file:deleted": { path: string; isDirectory: boolean };
  "file:moved": FileMovedPayload;
  "file:copied": { sourcePath: string; destPath: string };

  "explorer:refreshed": { path?: string } | void;
  "explorer:collapse-all": void;
  "explorer:multi-selected": { paths: string[] };
  "watcher:fs-changed": { type: "create" | "modify" | "delete"; path: string };

  "editor:document-opened": { path: string };
  "editor:document-closed": { path: string };
  "editor:document-saved": { path: string };
  "editor:document-changed": { path: string; isDirty: boolean };
  "editor:active-changed": { path: string | null };
  "editor:reveal-in-explorer": { path: string };
  "search:navigate-to-match": { path: string; line: number; column: number; matchLength?: number };
  "sidebar:switch-tab": "explorer" | "search";
};

type EventHandler<T> = (data: T) => void;

class IDEEventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<keyof IDEEventMap, Set<EventHandler<any>>>();

  on<K extends keyof IDEEventMap>(event: K, handler: EventHandler<IDEEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit<K extends keyof IDEEventMap>(event: K, data: IDEEventMap[K]): void {
    const set = this.handlers.get(event);
    if (set) {
      set.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[IDEEventBus] Error in handler for event "${event}":`, error);
        }
      });
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const ideEvents = new IDEEventBus();

