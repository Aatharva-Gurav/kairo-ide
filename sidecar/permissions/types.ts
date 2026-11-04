/**
 * Types and interfaces for Kairo Agent Permission & Security System.
 */
import type { ToolApprovalRequest, ToolApprovalResult } from "@cline/shared";

export type PermissionAction =
  | "read_file"
  | "search_files"
  | "list_directory"
  | "create_file"
  | "modify_file"
  | "delete_file"
  | "move_file"
  | "rename_file"
  | "execute_command"
  | "install_dependency"
  | "access_network"
  | "start_mcp_server"
  | "access_external_resource"
  | "unknown";

export type RiskLevel =
  | "read_only"
  | "low"
  | "moderate"
  | "high"
  | "critical";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface ApprovalRecord {
  approvalId: string;
  sessionId: string;
  taskId: string;
  agentId: string;
  toolName: string;
  action: PermissionAction;
  risk: RiskLevel;
  exactArguments: unknown;
  argumentsHash: string;
  workspace: string;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  resolve?: (result: ToolApprovalResult) => void;
  reject?: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface PermissionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  action: PermissionAction;
  risk: RiskLevel;
  reason?: string;
}

export interface PathValidationResult {
  valid: boolean;
  canonicalPath?: string;
  relativePath?: string;
  error?: string;
}

export interface ToolApprovalNotifierPayload {
  approvalId: string;
  sessionId: string;
  taskId: string;
  agentId: string;
  toolName: string;
  action: PermissionAction;
  risk: RiskLevel;
  exactArguments: unknown;
  argumentsHash: string;
  workspace: string;
  createdAt: number;
  expiresAt: number;
}
