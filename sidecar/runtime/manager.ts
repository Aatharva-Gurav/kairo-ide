import { ClineCore, type ClineCoreOptions } from "@cline/sdk";
import { Logger } from "../utils/logger";
import { ApprovalCoordinator } from "../permissions/approval-coordinator";
import { PermissionManager } from "../permissions/permission-manager";

export type RuntimeLifecycleStatus =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "disposing"
  | "disposed"
  | "error";

export interface RuntimeManagerOptions {
  clientName?: string;
  fetchImpl?: typeof fetch;
  approvalCoordinator: ApprovalCoordinator;
  permissionManager?: PermissionManager;
}

export class RuntimeManager {
  private status: RuntimeLifecycleStatus = "uninitialized";
  private clineInstance: ClineCore | null = null;
  private initPromise: Promise<ClineCore> | null = null;
  private readonly logger: Logger;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly permissionManager?: PermissionManager;
  private readonly clientName: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly startedAt: number = Date.now();

  constructor(logger: Logger, options: RuntimeManagerOptions) {
    this.logger = logger.child("runtime-manager");
    this.approvalCoordinator = options.approvalCoordinator;
    this.permissionManager = options.permissionManager;
    this.clientName = options.clientName ?? "kairo-ide";
    this.fetchImpl = options.fetchImpl;
  }

  public async initialize(): Promise<ClineCore> {
    if (this.status === "ready" && this.clineInstance) {
      return this.clineInstance;
    }

    if (this.initPromise) {
      this.logger.debug("Runtime initialization already in progress, awaiting existing promise");
      return this.initPromise;
    }

    this.status = "initializing";
    this.logger.info(`Initializing Cline SDK runtime (clientName: ${this.clientName})...`);

    this.initPromise = (async () => {
      try {
        const coreOptions: ClineCoreOptions = {
          clientName: this.clientName,
          backendMode: "local",
          automation: false,
          capabilities: {
            requestToolApproval: (req) =>
              this.permissionManager
                ? this.permissionManager.handleToolApprovalRequest(req)
                : this.approvalCoordinator.requestApproval(req),
          },
          fetch: this.fetchImpl,
        };

        const instance = await ClineCore.create(coreOptions);
        this.clineInstance = instance;
        this.status = "ready";
        this.logger.info("Cline SDK runtime initialized successfully (ready)");
        return instance;
      } catch (err) {
        this.status = "error";
        this.logger.error("Failed to initialize Cline SDK runtime", err);
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public getInstance(): ClineCore {
    if (this.status !== "ready" || !this.clineInstance) {
      throw new Error(`ClineCore runtime is not ready (current status: ${this.status})`);
    }
    return this.clineInstance;
  }

  public isReady(): boolean {
    return this.status === "ready" && this.clineInstance !== null;
  }

  public getStatus(): {
    status: RuntimeLifecycleStatus;
    clientName: string;
    activeSessions: number;
    uptime: number;
  } {
    return {
      status: this.status,
      clientName: this.clientName,
      activeSessions: 0,
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }

  public async dispose(): Promise<void> {
    if (this.status === "disposing" || this.status === "disposed") {
      return;
    }

    this.status = "disposing";
    this.logger.info("Disposing Cline SDK runtime...");

    // Abort any pending approvals first
    this.approvalCoordinator.abortAll("Runtime is disposing");

    if (this.clineInstance) {
      try {
        await this.clineInstance.dispose();
      } catch (err) {
        this.logger.warn("Error during ClineCore disposal", err);
      } finally {
        this.clineInstance = null;
      }
    }

    this.status = "disposed";
    this.logger.info("Cline SDK runtime disposed cleanly");
  }

  public async restart(): Promise<ClineCore> {
    this.logger.info("Restarting Cline SDK runtime...");
    await this.dispose();
    this.status = "uninitialized";
    return this.initialize();
  }
}
