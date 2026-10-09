export type CreationType = "file" | "folder";

export interface DestinationFolder {
  id: string; // normalized path
  name: string;
  path: string;
  parentPath?: string | null;
  depth: number;
  children?: DestinationFolder[];
  isExpanded?: boolean;
  isLoading?: boolean;
  isLoaded?: boolean;
}

export interface CreationValidationResult {
  valid: boolean;
  error?: string;
}
