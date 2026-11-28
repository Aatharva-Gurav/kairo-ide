# File Explorer (`features/file-explorer`)

## Feature Overview
Provides an interactive, keyboard-accessible directory tree inside the right sidebar for browsing, creating, renaming, copying, moving, deleting, undoing/redoing, and filtering workspace files and folders.

## Implementation Location
- **Frontend Feature Module**: [`features/file-explorer/`](../../../features/file-explorer/)
  - `store.tsx` (`FileExplorerProvider`, `useFileExplorer`)
  - `types.ts` (`FileSystemNode`, `ExplorerSortConfig`, `BatchRenameRule`, `ItemProperties`, etc.)
  - `service.ts` (`FileExplorerService`, `DEFAULT_EXCLUSIONS`)
  - `cache.ts` (`directoryCache`)
  - `history.service.ts` (`ExplorerHistoryService` — undo/redo stack up to 30 operations)
  - `components/`: `file-explorer.tsx`, `explorer-toolbar.tsx`, `explorer-search-bar.tsx`, `explorer-tree.tsx`, `file-tree-node.tsx`, `context-menu.tsx`, `confirm-delete-modal.tsx`, `batch-rename-modal.tsx`, `move-items-modal.tsx`, `file-icon.tsx`
  - `service.test.ts` (unit tests)
- **Window Drag-and-Drop**: [`components/tauri-drag-drop-listener.tsx`](../../../components/tauri-drag-drop-listener.tsx)
- **Rust Backend**: [`src-tauri/src/commands/fs.rs`](../../../src-tauri/src/commands/fs.rs)

## Architecture
- Lazily reads directory contents via `fs_read_directory` and caches directory listings in `directoryCache` (`cache.ts`) with invalidation on FS mutations or explicit refresh.
- Respects live settings from `SettingsProvider`: `explorer.sortOrder`, `explorer.compactFolders`, `explorer.excludeDefaultFiles`, `explorer.excludePatterns`, `explorer.confirmDelete`.
- Supports multi-file selection (`Ctrl/Cmd+Click`, `Shift+Click`), inline input creation/renaming, drag-and-drop between folders or from the OS window (`TauriDragDropListener`), and workspace focus tracking (`explorerFocus` for contextual keybindings like `Ctrl+F` filter).

## Feature Functionality
- Tree navigation with keyboard focus (`Ctrl+Shift+E` / `Cmd+Shift+E`), arrow expansion, and live search/filter bar (`Ctrl+F` / `Cmd+F` when explorer is focused)
- Sorting modes (folders first, alphabetical, files-first, modified time, type) and compact single-child folder chaining (`compactFolders`)
- Create file/folder inline (`Ctrl+N` / `Cmd+N`), rename, duplicate, copy/cut/paste, move via modal, batch rename multiple items (`BatchRenameModal`)
- Undo/Redo for file moves, renames, copies, creates, and batch renames (`ExplorerHistoryService`, up to 30 operations)
- Delete confirmation (`ConfirmDeleteModal` when `explorer.confirmDelete` is enabled)
- Reveal in OS File Explorer/Finder (`fs_reveal_in_manager`) & terminal launch at folder from `ContextMenu`

## Dependencies
- `@/lib/tauri-ipc` & Rust `commands/fs.rs` (`WorkspaceGuard` + `SensitivePathPolicy` enforced on every call)
- `features/icon-theme` (`FileIcon`)
- `features/settings`, `features/workspace`, `features/editor`, `features/terminal`

## Configuration
Relevant `features/settings/registry.ts` keys:
- `explorer.sortOrder`
- `explorer.compactFolders`
- `explorer.confirmDelete`
- `explorer.excludeDefaultFiles` (excludes `node_modules`, `.git`, `.next`, `target`, `dist`, `build` when enabled)
- `explorer.excludePatterns`

## User Workflow
1. Press `Ctrl+Shift+E` or select **Explorer** in the right sidebar after opening a workspace.
2. Right-click any item for context operations, press `Ctrl+F` inside the explorer to filter the tree, or drag files directly from your OS into folders.

## Development Notes
- **Tauri WebView Drag-and-Drop (`src-tauri/tauri.conf.json`)**: `dragDropEnabled` is set to `false` on the main window so native WebView2/WKWebView interception does not block HTML5 `draggable` / `onDragStart` / `onDragOver` / `onDrop` events for internal file/folder moves, explorer-to-editor drops, or external OS file drops (`FileExplorerService.importExternalFiles`).
- Always invalidate affected parent directories in `directoryCache` after mutations.
- All FS mutations pass through `WorkspaceGuard`; protected files (e.g., `.env*`, `.git/*`) remain blocked by backend security policy.

## Known Limitations
- Undo/Redo history tracks move, rename, copy, create, and batch-rename operations in memory (max 30 items) and does not restore permanently deleted files from a trash bin.
- `PluggableFileSystemWatcher` (`lib/watcher.ts`) is an abstraction not yet backed by an active Rust `notify` daemon thread, so external edits outside the IDE require clicking Refresh (`explorer:refreshed`).

## Related Documentation
- [Workspace Feature](../workspace/README.md)
- [Icon Theme Feature](../icon-theme/README.md)
- [Editor Feature](../editor/README.md)
