import { describe, it, expect, afterEach } from "bun:test";
import { RuntimeManager } from "../runtime/manager";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { Logger } from "../utils/logger";

describe("RuntimeManager", () => {
  const logger = new Logger("test-runtime-mgr");
  let manager: RuntimeManager | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
      manager = null;
    }
  });

  it("initializes Cline SDK once and maintains singleton ready state", async () => {
    const coordinator = new ApprovalCoordinator(logger);
    manager = new RuntimeManager(logger, {
      clientName: "kairo-ide-test",
      approvalCoordinator: coordinator,
    });

    expect(manager.isReady()).toBe(false);
    expect(manager.getStatus().status).toBe("uninitialized");

    // Initialize concurrently
    const [instance1, instance2] = await Promise.all([
      manager.initialize(),
      manager.initialize(),
    ]);

    expect(manager.isReady()).toBe(true);
    expect(manager.getStatus().status).toBe("ready");
    expect(instance1).toBe(instance2);
    expect(instance1.clientName).toBe("kairo-ide-test");

    // Dispose
    await manager.dispose();
    expect(manager.isReady()).toBe(false);
    expect(manager.getStatus().status).toBe("disposed");
  });

  it("throws if getInstance() is called before initialization", () => {
    const coordinator = new ApprovalCoordinator(logger);
    manager = new RuntimeManager(logger, {
      clientName: "kairo-ide-test",
      approvalCoordinator: coordinator,
    });

    expect(() => manager!.getInstance()).toThrow("ClineCore runtime is not ready");
  });
});
