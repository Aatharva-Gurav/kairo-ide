# Kairo IDE

Kairo IDE is a modern, extensible desktop IDE shell built with **Next.js 16**, **Tauri 2**, **TypeScript**, and **React 19**.

## Core Features Implemented

1. **Project / Workspace Management**:
   - Native OS folder picker dialog via Tauri backend.
   - Active workspace representation with name, root path, and timestamps.
   - Persistent Recent Projects system (automatic deduplication, ordering by last opened, configurable capacity).
   - Automatic workspace restoration on startup with graceful handling for moved/deleted directories.
   - Clean empty workspace view with quick action buttons.

2. **File Explorer**:
   - Real-time filesystem representation (zero mock data).
   - Lazy loading of directory trees on expand to maintain high performance on large codebases.
   - File and directory operations:
     - Create file & directory (with filename and reserved name validation).
     - Inline rename (F2 or context menu) with overwrite prevention.
     - Confirmation modal before destructive deletions.
     - Copy, cut, and paste across directories (with self-descendant protection).
     - File duplicate with automatic numbering (`file copy.ts`, `file copy 2.ts`).
     - Manual refresh preserving folder expansion state.
     - Drag-and-drop file/folder moving.
   - Context menus for files, folders, and workspace root.
   - Full keyboard navigation (arrows, Enter, F2, Delete).
   - File-type and extension-aware icons with `@hugeicons/core-free-icons`.

---

## Architecture Overview

```text
src/
├── app/
│   ├── layout.tsx             # Root layout and theme providers
│   └── page.tsx               # Main IDE shell with providers, dynamic breadcrumbs, and metrics
├── components/
│   ├── app-sidebar.tsx        # Floating sidebar housing Workspace & File Explorer
│   └── ui/                    # Base UI components (Button, Input, Sidebar, etc.)
├── features/
│   ├── workspace/
│   │   ├── types.ts           # Workspace and RecentWorkspace interfaces
│   │   ├── service.ts         # Workspace logic, persistence, and validation
│   │   ├── store.tsx          # WorkspaceProvider & useWorkspace hook
│   │   └── components/
│   │       ├── empty-workspace-view.tsx
│   │       └── workspace-header.tsx
│   └── file-explorer/
│       ├── types.ts           # FileSystemNode, Clipboard, and ContextMenu models
│       ├── service.ts         # Real filesystem operations via Tauri IPC
│       ├── store.tsx          # FileExplorerProvider, lazy-loader, and keyboard nav
│       └── components/
│           ├── file-explorer.tsx
│           ├── file-tree-node.tsx
│           ├── file-icon.tsx
│           ├── context-menu.tsx
│           └── confirm-delete-modal.tsx
├── lib/
│   ├── events.ts              # Typed IDE Event Bus (ideEvents)
│   ├── tauri-ipc.ts           # Tauri invoke wrapper, error formatting, and path utilities
│   └── utils.ts
src-tauri/
├── src/
│   ├── lib.rs                 # Tauri builder & command handler registration
│   └── commands/
│       ├── mod.rs
│       ├── workspace.rs       # workspace_pick_folder, workspace_validate_path
│       └── fs.rs              # fs_read_directory, fs_create_file, fs_rename, etc.
└── Cargo.toml
```

---

## Tauri Backend & Security

All filesystem access is isolated behind a secure Tauri command boundary in `src-tauri/src/commands/`:

- `workspace_pick_folder`: Invokes native cross-platform folder picker dialog via `rfd`.
- `workspace_validate_path`: Validates directory accessibility.
- `fs_read_directory`: Reads directory contents (directories first, case-insensitive alphabetical sort).
- `fs_create_file`: Validates and creates empty file without overwriting.
- `fs_create_directory`: Creates directory.
- `fs_rename`: Renames file or directory.
- `fs_delete`: Recursively deletes directory or file.
- `fs_copy`: Recursively copies directories or files with descendant protection.
- `fs_move`: Moves files or directories safely across mounts.
- `fs_duplicate`: Generates duplicate file with safe naming conflict resolution.

---

## Event Bus & Extension Points

Future IDE modules can subscribe to events via `ideEvents` in `lib/events.ts` without modifying the File Explorer UI components:

```ts
import { ideEvents } from "@/lib/events";

// Monaco Editor integration
ideEvents.on("file:open-requested", (file) => {
  // Open file in Monaco editor tab
});

// Git subsystem integration
ideEvents.on("workspace:opened", (workspace) => {
  // Initialize git repository watcher for workspace.rootPath
});

// Terminal integration
ideEvents.on("workspace:opened", (workspace) => {
  // Set default working directory (Cwd) for terminal sessions
});

// Search subsystem integration
ideEvents.on("file:created", ({ path }) => {
  // Index new file into search engine
});
```

---

## Testing

### Rust Backend Tests
Run in `src-tauri/`:
```bash
cargo test --lib
```
Covers:
- Directory reading and sorting
- File creation and duplicate collision resolution
- Safe descendant copy/move recursion prevention
- Path validation for existing and non-existing directories

### Frontend Unit Tests
Run in project root:
```bash
npm test
```
Covers:
- Cross-platform path utilities (`joinPath`, `dirname`, `basename`, `isDescendant`)
- Filename validation against illegal characters and Windows reserved names
- Workspace creation, recent list deduplication, ordering, and capacity limits
- File explorer validation and boundary checks
