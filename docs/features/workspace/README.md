# Workspace Management (`features/workspace`)

## Feature Overview
Controls opening, switching, closing, persisting, and authorizing project folders (including multi-root helpers) across both the React state layer and Rust's native `WorkspaceGuard` security boundary.

## Implementation Location
- **Frontend Feature Module**: [`features/workspace/`](../../../features/workspace/)
  - `types.ts` (`Workspace`, `WorkspaceRoot`, `RecentWorkspace`, `WorkspaceLifecycleState`)
  - `service.ts` (`WorkspaceService`)
  - `service.test.ts` (unit tests)
  - `store.tsx` (`WorkspaceProvider`, `useWorkspace`, `useWorkspaceOptional`)
  - Components:
    - `components/empty-workspace-view.tsx` (recent workspaces & Open Folder CTA)
    - `components/workspace-closing-overlay.tsx` (stage progress modal during workspace teardown)
    - `components/workspace-dirty-confirm-modal.tsx` (unsaved changes guard before close/switch)
- **Rust Backend**: [`src-tauri/src/commands/workspace.rs`](../../../src-tauri/src/commands/workspace.rs) & [`src-tauri/src/security/workspace_guard.rs`](../../../src-tauri/src/security/workspace_guard.rs)

## Architecture
- `WorkspaceProvider` models explicit lifecycle transitions (`OPEN`, `CLOSING`, `CLOSED`) protected by sequence/transition guards so overlapping close/switch calls cannot corrupt state.
- Opening or switching a workspace coordinates:
  1. Unsaved-buffer check via `registerBeforeCloseHook()` callbacks (used by `EditorProvider` so dirty documents prompt before closing).
  2. Native authorization via `workspace_open`, updating `WorkspaceGuard`'s authorized roots, incrementing its monotonic `generation`, and setting `TerminalManager`'s default workspace root.
  3. Clean teardown of active terminal sessions (`killWorkspaceTerminals` / `TerminalInstanceRegistry`), explorer caches, and editor buffers on close/switch.
  4. Synchronization with `SettingsService.setWorkspace(rootPath)` and native Tauri Recent Workspaces menu (`menu_update_recent_workspaces`, `menu_set_has_workspace`).
  5. Project technology detection via `workspace_detect_project` (`Node.js`, `TypeScript`, `Rust`, `Python`, `Java`, `C/C++`, `Go`, `Tauri`, `Next.js`, etc.).

## Feature Functionality
- Native OS folder picker (`workspace_pick_folder`), path opening, switching, and closing (`Ctrl+K F` / `Cmd+K F`)
- Multi-root helpers (`workspace_add_root`, `workspace_remove_root`) reflected in `isMultiRoot` and `roots`
- Recent workspaces list persisted in `localStorage` with quick reopen and Clear/Remove actions
- Automatic restoration of last opened workspace on startup (`restoreLastWorkspace()`)
- Staged closing overlay (`workspace-closing-overlay.tsx`) with visible cleanup progress when closing/switching workspaces

## Dependencies
- `lib/tauri-ipc.ts` & `src-tauri/src/commands/workspace.rs`
- `features/settings/services/settings.service.ts`
- `features/terminal/services/terminal-ipc.service.ts` & `TerminalInstanceRegistry`
- `lib/events.ts` (`workspace:*` events)

## Configuration
- Storage keys: recent workspaces & last active workspace keys managed in `features/workspace/service.ts`
- Tauri commands: `workspace_open`, `workspace_close`, `workspace_add_root`, `workspace_remove_root`, `workspace_pick_folder`, `workspace_pick_file`, `workspace_save_file_as`, `workspace_validate_path`, `workspace_detect_project`

## User Workflow
1. Click **Open Folder** from the empty explorer/titlebar/menu or press `Ctrl+Shift+O` (`Cmd+Shift+O`).
2. Select a recent project from the welcome view or File -> Open Recent menu.
3. Close the workspace via `Ctrl+K F`, titlebar menu, or sidebar controls; if unsaved files exist, choose Save All, Discard, or Cancel.

## Development Notes
- Subsystems that hold open state across workspaces (like `EditorProvider` or `TerminalProvider`) should register cleanup hooks or listen to `workspace:closing`, `workspace:closed`, and `workspace:switched` on `ideEvents`.

## Known Limitations
- While `WorkspaceGuard` and `WorkspaceContext` expose multi-root add/remove APIs, the primary sidebar tree and workspace search still treat `activeWorkspace.rootPath` as the primary tree root.
- Opening arbitrary folders outside Tauri relies on browser path validation mocks without disk access.

## Related Documentation
- [Architecture Overview](../../architecture/architecture-overview.md)
- [File Explorer Feature](../file-explorer/README.md)
- [Integrated Terminal Feature](../terminal/README.md)
