/**
 * Tool execution coordinator stub for Kairo AI Agent sidecar.
 * Will be fully implemented in Stage 04 (file operations, search, shell execution).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  isReadOnly: boolean;
}

export interface IToolCoordinator {
  listAvailableTools(): ToolDefinition[];
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
