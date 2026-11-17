/**
 * Dedicated Agent Command Execution Service.
 *
 * Coordinates non-interactive shell command execution requested by the AI agent.
 * Guarantees zero pollution of the user's interactive xterm.js terminal sessions.
 */
import {
  AiTerminalExecutionAdapter,
  ApprovalRequester,
} from "@/features/terminal/services/ai-terminal-adapter";
import {
  RunCommandRequest,
  RunCommandResponse,
  RunBackgroundCommandRequest,
  RunBackgroundCommandResponse,
  GetCommandOutputResponse,
} from "@/features/terminal/types";

export interface AgentCommandHistoryItem {
  id: string;
  command: string;
  cwd?: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  isBackground: boolean;
  status: "running" | "completed" | "failed" | "cancelled";
  truncated: boolean;
}

export class AgentCommandService {
  private readonly adapter: AiTerminalExecutionAdapter;
  private history: AgentCommandHistoryItem[] = [];

  constructor(options?: {
    approvalRequester?: ApprovalRequester;
    autoTrustSafeCommands?: boolean;
    adapter?: AiTerminalExecutionAdapter;
  }) {
    this.adapter =
      options?.adapter ??
      new AiTerminalExecutionAdapter({
        approvalRequester: options?.approvalRequester,
        autoTrustSafeCommands: options?.autoTrustSafeCommands,
      });
  }

  public setApprovalRequester(requester: ApprovalRequester): void {
    this.adapter.setApprovalRequester(requester);
  }

  public setAutoTrustSafeCommands(enabled: boolean): void {
    this.adapter.setAutoTrustSafeCommands(enabled);
  }

  /**
   * Executes a command synchronously on behalf of the AI agent.
   * Completely isolated from user interactive terminal instances.
   */
  public async execute(request: RunCommandRequest): Promise<RunCommandResponse> {
    const id = `agent_cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const historyItem: AgentCommandHistoryItem = {
      id,
      command: request.command,
      cwd: request.cwd,
      startedAt: Date.now(),
      isBackground: false,
      status: "running",
      truncated: false,
    };
    this.history.push(historyItem);

    try {
      const response = await this.adapter.run_command(request);
      historyItem.finishedAt = Date.now();
      historyItem.exitCode = response.exitCode;
      historyItem.status = response.exitCode === 0 ? "completed" : "failed";
      historyItem.truncated = response.truncated;
      return response;
    } catch (err) {
      historyItem.finishedAt = Date.now();
      historyItem.status = "failed";
      throw err;
    }
  }

  /**
   * Executes a long-running background command on behalf of the AI agent.
   */
  public async executeBackground(
    request: RunBackgroundCommandRequest
  ): Promise<RunBackgroundCommandResponse> {
    const response = await this.adapter.run_background_command(request);
    this.history.push({
      id: response.executionId,
      command: request.command,
      cwd: request.cwd,
      startedAt: Date.now(),
      isBackground: true,
      status: "running",
      truncated: false,
    });
    return response;
  }

  /**
   * Retrieves output for a running or completed background process.
   */
  public async getOutput(executionId: string): Promise<GetCommandOutputResponse> {
    const res = await this.adapter.get_command_output({ executionId });
    const item = this.history.find((h) => h.id === executionId);
    if (item && res.status !== "running") {
      item.finishedAt = Date.now();
      item.exitCode = res.exitCode;
      item.status = res.status === "completed" ? "completed" : "failed";
    }
    return res;
  }

  /**
   * Stops an active background command.
   */
  public async stop(executionId: string): Promise<boolean> {
    const res = await this.adapter.stop_process({ executionId });
    const item = this.history.find((h) => h.id === executionId);
    if (item) {
      item.status = "cancelled";
      item.finishedAt = Date.now();
    }
    return res.stopped;
  }

  public getHistory(): AgentCommandHistoryItem[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
  }

  public getAdapter(): AiTerminalExecutionAdapter {
    return this.adapter;
  }
}
