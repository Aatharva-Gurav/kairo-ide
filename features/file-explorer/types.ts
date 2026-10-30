export type ExplorerSortMode =
  | "folders-first"
  | "files-first"
  | "alphabetical"
  | "type-based";

export interface ExplorerSortConfig {
  mode: ExplorerSortMode;
  caseSensitive: boolean;
}

export type GitStatus = "modified" | "added" | "deleted" | "untracked" | "ignored";

export interface FileSystemNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  parentPath?: string;
  children?: FileSystemNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
  size?: number;
  modifiedAt?: number;
  fileExtension?: string;
  gitStatus?: GitStatus; // architectural extension point for future Git integration
}

export type ClipboardType = "copy" | "cut";

export interface ClipboardOperation {
  sourceNodes: FileSystemNode[];
  sourceNode?: FileSystemNode; // optional backwards-compatibility alias
  type: ClipboardType;
}

export type InlineActionType = "create-file" | "create-folder" | "rename";

export interface InlineAction {
  type: InlineActionType;
  parentPath: string;
  targetNodeId?: string; // only for rename
  initialValue?: string;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  node: FileSystemNode | null;
  selectedNodes?: FileSystemNode[];
  isRootOrEmpty: boolean;
}

export type BatchRenameMode = "find-replace" | "prefix-suffix" | "numbering";

export interface BatchRenameRule {
  mode: BatchRenameMode;
  find: string;
  replace: string;
  caseSensitive: boolean;
  prefix: string;
  suffix: string;
  numberingPattern: string;
  startNumber: number;
  padZeros: number;
  preserveExtension: boolean;
}

export interface BatchRenamePreviewItem {
  node: FileSystemNode;
  originalName: string;
  newName: string;
  hasConflict: boolean;
  conflictReason?: string;
}

export interface ItemProperties {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  fileCount: number;
  folderCount: number;
  isReadonly: boolean;
  createdAt?: number;
  modifiedAt?: number;
}

