import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceService, MAX_RECENT_PROJECTS, STORAGE_KEYS } from "./service";

// Simple in-memory localStorage polyfill for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("WorkspaceService", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("creates workspace model with name derived from root directory", () => {
    const ws = WorkspaceService.createWorkspace("C:\\Projects\\MyApp");
    expect(ws.name).toBe("MyApp");
    expect(ws.rootPath).toBe("C:/Projects/MyApp");
    expect(ws.id).toMatch(/^ws_/);
    expect(ws.openedAt).toBeGreaterThan(0);
    expect(ws.lastOpenedAt).toBeGreaterThan(0);
    expect(ws.roots.length).toBe(1);
    expect(ws.roots[0].name).toBe("MyApp");
  });

  it("adds and deduplicates recent workspaces", () => {
    const ws1 = WorkspaceService.createWorkspace("C:/Projects/ProjectA");
    const ws2 = WorkspaceService.createWorkspace("C:/Projects/ProjectB");

    WorkspaceService.addRecentWorkspace(ws1);
    WorkspaceService.addRecentWorkspace(ws2);

    let recents = WorkspaceService.getRecentWorkspaces();
    expect(recents.length).toBe(2);
    expect(recents[0].name).toBe("ProjectB"); // Most recently opened first

    // Reopen ws1 (should move to front and not duplicate)
    const reopenedWs1 = { ...ws1, lastOpenedAt: Date.now() + 1000 };
    WorkspaceService.addRecentWorkspace(reopenedWs1);

    recents = WorkspaceService.getRecentWorkspaces();
    expect(recents.length).toBe(2);
    expect(recents[0].name).toBe("ProjectA");
  });

  it("enforces MAX_RECENT_PROJECTS limit", () => {
    for (let i = 1; i <= MAX_RECENT_PROJECTS + 5; i++) {
      const ws = WorkspaceService.createWorkspace(`C:/Projects/Project_${i}`);
      WorkspaceService.addRecentWorkspace(ws);
    }

    const recents = WorkspaceService.getRecentWorkspaces();
    expect(recents.length).toBe(MAX_RECENT_PROJECTS);
    expect(recents[0].name).toBe(`Project_${MAX_RECENT_PROJECTS + 5}`);
  });

  it("removes a recent workspace from the list", () => {
    const ws1 = WorkspaceService.createWorkspace("C:/Projects/ProjectA");
    const ws2 = WorkspaceService.createWorkspace("C:/Projects/ProjectB");

    WorkspaceService.addRecentWorkspace(ws1);
    WorkspaceService.addRecentWorkspace(ws2);

    WorkspaceService.removeRecentWorkspace("C:/Projects/ProjectA");

    const recents = WorkspaceService.getRecentWorkspaces();
    expect(recents.length).toBe(1);
    expect(recents[0].name).toBe("ProjectB");
  });

  it("clears all recent workspaces", () => {
    const ws1 = WorkspaceService.createWorkspace("C:/Projects/ProjectA");
    const ws2 = WorkspaceService.createWorkspace("C:/Projects/ProjectB");
    WorkspaceService.addRecentWorkspace(ws1);
    WorkspaceService.addRecentWorkspace(ws2);

    expect(WorkspaceService.getRecentWorkspaces().length).toBe(2);
    WorkspaceService.clearRecentWorkspaces();
    expect(WorkspaceService.getRecentWorkspaces().length).toBe(0);
  });

  it("persists and clears last active workspace", () => {
    const ws = WorkspaceService.createWorkspace("C:/Projects/ActiveProject");
    WorkspaceService.setLastActiveWorkspace(ws);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_WORKSPACE)!);
    expect(stored.name).toBe("ActiveProject");

    WorkspaceService.setLastActiveWorkspace(null);
    expect(localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_WORKSPACE)).toBeNull();
  });

  it("persists and restores per-workspace explorer state", () => {
    const wsPath = "C:/Projects/WorkspaceWithState";
    WorkspaceService.saveWorkspaceState(wsPath, {
      expandedPaths: ["C:/Projects/WorkspaceWithState/src", "C:/Projects/WorkspaceWithState/lib"],
      sortMode: "type-based",
      showHidden: true,
    });

    const loaded = WorkspaceService.getWorkspaceState(wsPath);
    expect(loaded).toBeDefined();
    expect(loaded?.expandedPaths).toEqual([
      "C:/Projects/WorkspaceWithState/src",
      "C:/Projects/WorkspaceWithState/lib",
    ]);
    expect(loaded?.sortMode).toBe("type-based");
    expect(loaded?.showHidden).toBe(true);
  });
});

