export * from "./approval-coordinator";

export type AgentMode = "plan" | "act";

export interface PermissionPolicy {
  mode: AgentMode;
  autoApproveReadOnly: boolean;
  autoApproveMutations: boolean;
}

export interface IPermissionManager {
  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
  canExecuteTool(toolName: string, isReadOnly: boolean): boolean;
}
