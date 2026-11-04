import { describe, it, expect } from "vitest";
import { TerminalIpcService } from "./terminal-ipc.service";

describe("TerminalIpcService", () => {
  it("provides fallback mock shells in browser environment", async () => {
    const shells = await TerminalIpcService.detectShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(shells[0].id).toBeDefined();
    expect(shells[0].name).toBeDefined();
  });

  it("creates mock session in browser environment", async () => {
    const session = await TerminalIpcService.createSession();
    expect(session.sessionId).toBeDefined();
    expect(session.status).toBe("running");
  });

  it("handles write and mock events when window is available", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const mockWindow = {
      addEventListener: (event: string, handler: (e: unknown) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: (e: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
      dispatchEvent: (event: { type: string; detail: unknown }) => {
        const list = listeners[event.type] || [];
        for (const fn of list) {
          fn(event);
        }
        return true;
      },
    };

    (global as unknown as { window?: unknown }).window = mockWindow;

    const session = await TerminalIpcService.createSession();
    const dataChunks: string[] = [];

    const unlisten = await TerminalIpcService.subscribeOutput(
      session.sessionId,
      (chunk) => {
        dataChunks.push(chunk);
      }
    );

    await TerminalIpcService.writeSession(session.sessionId, "echo test\r\n");
    expect(dataChunks).toContain("echo test\r\n");

    unlisten();
    delete (global as unknown as { window?: unknown }).window;
  });
});
