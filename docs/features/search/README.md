# Workspace Search & Replace (`features/search`)

## Feature Overview
Provides workspace-wide text search and atomic multi-file search-and-replace executed in the Rust backend and rendered in an interactive sidebar panel with match highlighting and confirmation guards.

## Implementation Location
- **Frontend Feature Module**: [`features/search/`](../../../features/search/)
  - `types.ts` (`SearchOptions`, `FileSearchResult`)
  - `services/search.service.ts` (`SearchService`)
  - `services/search.service.test.ts` (unit tests)
  - `store.tsx` (`SearchProvider`, `useSearch`)
  - `components/workspace-search-panel.tsx` (`WorkspaceSearchPanel`)
  - `components/search-result-item.tsx` (`SearchResultItem`)
  - `components/replace-confirm-modal.tsx` (`ReplaceConfirmModal`)
- **Sidebar Integration**: [`components/app-sidebar.tsx`](../../../components/app-sidebar.tsx)
- **IPC Bridge & Rust Engine**:
  - [`lib/tauri-ipc.ts`](../../../lib/tauri-ipc.ts) (`searchWorkspaceFiles`, `replaceInWorkspaceFiles`)
  - [`src-tauri/src/commands/fs.rs`](../../../src-tauri/src/commands/fs.rs) (`fs_search_workspace`, `fs_replace_in_files`)

## Architecture
1. `SearchProvider` subscribes to user/workspace settings (`search.excludePatterns`, `search.includePatterns`, `search.caseSensitive`, `search.wholeWord`, `search.useRegex`) and syncs defaults dynamically without overwriting actively edited filter text cleanly unless settings change.
2. Queries in `WorkspaceSearchPanel` debounce (`250ms`) and invoke `SearchService.search()`, which validates regex syntax locally before sending `fs_search_workspace` over Tauri IPC (capped at `5000` results).
3. Rust executes search on Tauri's blocking thread pool (`spawn_blocking`), walking the active workspace inside `WorkspaceGuard`, pruning excluded directories (`node_modules`, `.git`, `.next`, `target`, `dist`, `vendor`, etc.) and respecting cooperative cancellation and workspace generation checks.
4. Clicking a match emits `search:navigate-to-match` via `ideEvents`, opening the file in `EditorProvider` and scrolling to the exact `line`, `column`, and `matchLength`.
5. `SearchService.replaceAll()` sorts occurrences bottom-to-top and right-to-left before invoking `fs_replace_in_files` atomically in Rust, preserving CRLF/LF line endings and validating every path against `WorkspaceGuard` and `SensitivePathPolicy`.

## Feature Functionality
- Incremental workspace search across active workspace root
- Toggleable **Match Case** (`Alt+C`), **Match Whole Word** (`Alt+W`), and **Regular Expression** (`Alt+R`) options inside the search input
- Glob-based **Include** and **Exclude** file pattern filters (comma or semicolon separated)
- Collapsible/expandable per-file match tree with line numbers and preview snippets
- Multi-file **Replace All** with summary preview in `ReplaceConfirmModal`
- Global shortcut (`Ctrl+Shift+F` / `Cmd+Shift+F`) switching the right sidebar to Search

## Dependencies
- Tauri FS search/replace commands (`walkdir`, `regex`, `globset` in Rust `Cargo.toml`)
- `features/editor` (navigating to matched line/column via `ideEvents`)
- `features/icon-theme` (`FileIcon`)

## Configuration
Relevant `features/settings/registry.ts` keys:
- `search.excludePatterns` (comma-separated globs)
- `search.includePatterns` (comma-separated globs)
- `search.caseSensitive` (`boolean`)
- `search.wholeWord` (`boolean`)
- `search.useRegex` (`boolean`)

## User Workflow
1. Press `Ctrl+Shift+F` (`Cmd+Shift+F` on macOS) or click the **Search** tab in the right sidebar.
2. Enter a search term, toggle Case/Whole Word/Regex or expand Include/Exclude filters.
3. Click any result row to jump directly to that line in Monaco Editor, or toggle Replace to review and confirm workspace-wide replacements.

## Development Notes
- Keep `SearchService.replaceAll()` sorted descending by line and column so multi-match replacements on the same line do not shift byte/character offsets.
- Ensure any new excluded directories are tested in both `features/search/services/search.service.test.ts` and `src-tauri/src/commands/fs.rs`.

## Known Limitations
- In browser dev mode (`npm run dev`), `searchWorkspaceFiles` returns `[]` because local disk search requires the Rust backend (`npx tauri dev`).
- Search scope queries `activeWorkspace.rootPath` (and prunes files matched by `SensitivePathPolicy` and binary checks).

## Related Documentation
- [Editor Feature](../editor/README.md)
- [Workspace Feature](../workspace/README.md)
- [Settings Feature](../settings/README.md)
