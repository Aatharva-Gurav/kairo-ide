# Kairo IDE

Kairo IDE is a high-performance, extensible desktop IDE shell built with **Next.js 16**, **React 19**, **TypeScript**, **Monaco Editor**, and **Tauri 2**.

---

## Core Features Implemented

### 1. Project / Workspace Management
- **Native Folder Picker**: Launches native cross-platform folder picker dialog via Tauri backend (`rfd`).
- **Active Workspace Lifecycle**: Real-time representation of workspace name, root path, and timestamps.
- **Persistent Recent Projects**: Automatic deduplication, ordered by last opened, configurable capacity, persisted across sessions.
- **Safe Workspace Restoration**: Automatic workspace restoration on startup with graceful fallback and notification if the directory was moved or deleted.
- **Empty State**: Clean onboarding view with quick action shortcuts to open or pick folders.

### 2. File Explorer
- **Real Filesystem Binding**: Zero mock data; operates directly on the underlying operating system filesystem.
- **Lazy-Loaded File Tree**: On-demand expansion of directories maintaining 60 FPS performance even on massive codebases.
- **Comprehensive File & Folder Operations**:
  - Create file and create folder (with strict cross-platform filename validation and Windows reserved names prevention: `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
  - Inline rename (`F2` or context menu) with collision checks.
  - Delete with confirmation dialog to prevent accidental data loss.
  - Clipboard operations: Copy, cut, and paste with recursive descendant circular-nesting protection.
  - Duplicate file with automatic numbering (`file copy.ts`, `file copy 2.ts`).
  - Refresh preserving directory expansion state.
  - Drag-and-drop file and directory moving.
- **Context Menus**: Context-aware menus for files, folders, and the root workspace.
- **Keyboard Navigation**: Full arrow-key tree traversal, `Enter` to open, `F2` to rename, `Delete` to remove.
- **Icon Set**: Extension- and file-type aware icons powered by `@hugeicons/core-free-icons`.

### 3. Code Editor
- **Monaco Editor Integration**: Embedded industry-standard Monaco Editor (`^0.56.0`) with dark and light theme synchronization matching the Kairo IDE design system.
- **Multi-Tab Document Management**:
  - Open multiple files concurrently with responsive horizontal tab bar.
  - Active tab highlighting, Seti file icons, and close buttons.
  - Middle-click to close tab.
  - Tab context menu: *Close*, *Close Others*, *Close All*, *Copy Path*, *Copy Relative Path*, and *Reveal in File Explorer*.
- **Dirty State Tracking & Safety**:
  - Real-time dirty state indicator (`•`) on tabs when content diverges from disk.
  - Single file save (`Ctrl+S` / `Cmd+S`) and Save All (`Ctrl+Alt+S`).
  - Close confirmation modal: Prompting to *Save*, *Don't Save*, or *Cancel* when closing any modified file or batch-closing tabs.
  - External modification detection: Background file system watcher integration prompts or updates documents when modified externally.
- **Monaco Model Lifecycle**:
  - Model caching and reuse by file URI (`file://...`).
  - Cursor position and scroll viewState preservation across tab switches.
  - Automatic model disposal on tab close to prevent memory leaks.
- **Binary & Large File Safeguards**:
  - Safe binary file detection (null-byte inspection and 20MB file threshold).
  - Built-in preview for image formats (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`, `.ico`).
  - Fallback banner for binary files with option to reveal in OS file explorer.
- **Breadcrumb Navigation & Status Bar**:
  - Hierarchical breadcrumbs showing workspace-relative folder and file path.
  - Bottom status bar displaying cursor line and column, indentation (Spaces: 2), encoding (UTF-8), language mode, and quick Format Document button.
- **Offline Desktop Execution**: Fully bundled Monaco assets (`loader.config({ monaco })`) ensuring zero reliance on remote CDNs or internet connectivity.

### 4. Syntax Highlighting
- **Comprehensive Language Detection**: Centralized language registry supporting 50+ programming languages and file extensions:
  - Web: TypeScript, JavaScript, JSX, TSX, HTML, CSS, SCSS, LESS, JSON, GraphQL, WebAssembly
  - Systems: Rust, C, C++, C#, Go, Zig, Swift, Objective-C
  - Scripting / Backend: Python, Ruby, PHP, Java, Kotlin, Scala, Dart, Perl, R, Lua, Julia, Elixir, Erlang, Haskell, Clojure, Groovy
  - Shell / Config: Bash, Zsh, PowerShell, Batch, YAML, TOML, XML, INI, Dockerfile, Makefile, SQL
  - Documents: Markdown, LaTeX, Plain Text
- **Special Filename Recognition**: Automatic syntax mapping for dotfiles and configuration manifests (`Dockerfile`, `Makefile`, `.gitignore`, `.env`, `package.json`, `tsconfig.json`, `Cargo.toml`, etc.).
- **Consistent Theme Sync**: Custom `kairo-dark` and `kairo-light` Monaco themes seamlessly synchronized with the application theme and Tailwind tokens.

### 5. Code Formatting
- **Extensible Formatter Provider Architecture**: Centralized `formatter.service.ts` allowing pluggable formatters registered by language ID.
- **Integrated Formatting Providers**:
  - Built-in Native JSON formatter with configurable indentation.
  - Monaco `formatDocument` bridge for all languages supported by Monaco language services (TypeScript, JavaScript, HTML, CSS, SCSS, JSON).
- **Format on Demand & Format on Save**:
  - Trigger formatting via keyboard shortcut (`Shift+Alt+F`).
  - Quick format button in the editor status bar.
  - Optional Format on Save setting.
- **Non-destructive Error Handling**: Catches syntax or parsing errors cleanly, preserving user text and dirty states without throwing unhandled exceptions.

### 6. Autocomplete / IntelliSense
- **Configured Monaco Language Services**:
  - Pre-configured TypeScript / JavaScript compiler defaults: `ESNext` target, `react-jsx`, `node` module resolution, diagnostic validation enabled.
  - Parameter hints, suggestion widgets, auto-closing brackets, and quotes.
- **Built-in Snippet Engine**:
  - Productivity code snippets for TypeScript and JavaScript:
    - `rfc`: React Function Component template
    - `uses`: `useState` hook snippet
    - `usee`: `useEffect` hook snippet
    - `clg`: `console.log` snippet
    - `trycatch`: Safe `try { ... } catch (error) { ... }` block
    - `afn`: Arrow function snippet

### 7. Code Navigation
- **Go to Definition**: `F12` or `Ctrl+Click` / `Cmd+Click` directly navigates to symbol definitions.
- **Peek Definition**: `Alt+F12` opens Monaco's inline peek widget.
- **Find References**: `Shift+F12` displays all symbol references across the project.
- **Quick Open Modal (`Ctrl+P` / `Cmd+P`)**:
  - Fast modal dialog indexing all workspace files.
  - Real-time fuzzy filtering by filename or path.
  - Keyboard navigation (arrows + Enter) to instantly open files in editor tabs.
- **Go to Line (`Ctrl+G` / `Cmd+G`)**:
  - Jump directly to line and column (`line[:col]`).
  - Validates line bounds against active document.

### 8. Search & Replace
- **In-File Find & Replace**: Monaco built-in interactive find widget (`Ctrl+F`) and replace widget (`Ctrl+H`).
- **Workspace-Wide Search Panel (`Ctrl+Shift+F`)**:
  - Dedicated search view in the sidebar with toggle switcher between Explorer and Search.
  - Fast, multi-threaded Rust search engine scanning workspace files.
  - Search options: Match Case, Match Whole Word, and Regular Expressions.
  - Scope filtering: Include and Exclude glob patterns (e.g. `*.ts, src/**`, `!node_modules, !dist`).
  - Search results grouped by file with hit counts, expandable match snippets, and line/column locations.
  - Direct navigation: Clicking any match opens the file in the editor and scrolls directly to the matching line.
- **Workspace-Wide Replace**:
  - Batch replacement preview with confirmation modal showing total files and match count before modifying disk.
  - Safe bottom-to-top replacement algorithm ensuring line and offset integrity during multi-match file writes.
  - Refresh and clear capabilities.

---

## Architecture Overview

```text
kairo-ide/
├── app/
│   ├── layout.tsx             # Root layout and theme providers
│   └── page.tsx               # IDE shell orchestrator (EditorProvider, SearchProvider, WorkspaceProvider)
├── components/
│   ├── app-sidebar.tsx        # Activity bar & sidebar (File Explorer / Workspace Search switcher)
│   └── ui/                    # Base UI components (Button, Input, Sidebar, Modal, etc.)
├── features/
│   ├── workspace/
│   │   ├── types.ts           # Workspace and RecentWorkspace interfaces
│   │   ├── service.ts         # Workspace logic, persistence, and validation
│   │   ├── store.tsx          # WorkspaceProvider & useWorkspace hook
│   │   └── components/
│   │       ├── empty-workspace-view.tsx
│   │       └── workspace-header.tsx
│   ├── file-explorer/
│   │   ├── types.ts           # FileSystemNode, Clipboard, and ContextMenu models
│   │   ├── service.ts         # Real filesystem operations via Tauri IPC
│   │   ├── store.tsx          # FileExplorerProvider, lazy-loader, and keyboard nav
│   │   └── components/
│   │       ├── file-explorer.tsx
│   │       ├── file-tree-node.tsx
│   │       ├── file-icon.tsx
│   │       ├── context-menu.tsx
│   │       └── confirm-delete-modal.tsx
│   ├── editor/
│   │   ├── types.ts           # EditorDocument, EditorSettings, Formatter interfaces
│   │   ├── store.tsx          # EditorProvider, active document, dirty tracking, shortcuts
│   │   ├── services/
│   │   │   ├── editor.service.ts       # Document loading, saving, binary checking
│   │   │   ├── language.service.ts     # 50+ language detection & Monaco ID mapping
│   │   │   ├── model.service.ts        # Monaco model lifecycle, URI mapping, viewState
│   │   │   ├── formatter.service.ts    # Formatter registry, JSON formatter, formatDocument
│   │   │   ├── intellisense.service.ts # TS compiler options, diagnostics, snippets
│   │   │   └── navigation.service.ts   # Go to definition, references, symbols, go-to-line
│   │   └── components/
│   │       ├── editor-workspace.tsx    # Master editor container with dynamic SSR-safe Monaco
│   │       ├── monaco-editor-view.tsx  # Bundled offline Monaco view, themes, event listeners
│   │       ├── editor-tabs.tsx         # Scrollable tab strip with Save All & Close All
│   │       ├── editor-tab.tsx          # Individual tab with Seti icon, dirty dot, context menu
│   │       ├── editor-breadcrumb.tsx   # Workspace relative path breadcrumbs
│   │       ├── editor-status-bar.tsx   # Line/col, spaces, UTF-8, language, format button
│   │       ├── editor-empty-state.tsx  # Empty editor view with keyboard shortcut guides
│   │       ├── binary-file-view.tsx    # Image previews and binary file safeguard banner
│   │       ├── close-confirm-modal.tsx # Save / Don't Save / Cancel dirty tab modal
│   │       ├── quick-open-modal.tsx    # Ctrl+P quick file fuzzy search
│   │       └── go-to-line-modal.tsx    # Ctrl+G jump to line dialog
│   └── search/
│       ├── types.ts           # SearchQuery, SearchResult, ReplaceRequest models
│       ├── store.tsx          # SearchProvider, query state, results tree
│       ├── services/
│       │   └── search.service.ts       # Search & replace IPC bridge and filters
│       └── components/
│           ├── workspace-search-panel.tsx # Full search input, options, and results tree
│           ├── search-result-item.tsx     # File result with match snippets
│           └── replace-confirm-modal.tsx  # Batch replacement confirmation dialog
├── lib/
│   ├── events.ts              # Typed IDE Event Bus (ideEvents)
│   ├── tauri-ipc.ts           # Tauri invoke wrapper, error formatting, path utilities
│   └── utils.ts
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # Tauri builder & command handler registration
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── workspace.rs   # workspace_pick_folder, workspace_validate_path
│   │       └── fs.rs          # fs_read_directory, fs_read_file, fs_write_file,
│   │                          # fs_search_workspace, fs_replace_in_files, fs_list_workspace_files
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

---

## Tauri Backend & Security

All filesystem access and workspace operations are strictly isolated behind Tauri command boundaries in `src-tauri/src/commands/`:

- `workspace_pick_folder`: Invokes native cross-platform folder picker dialog via `rfd`.
- `workspace_validate_path`: Validates directory accessibility and existence.
- `fs_read_directory`: Reads directory contents (directories first, case-insensitive sort).
- `fs_read_file`: Reads UTF-8 file content with binary detection and 20MB safety limit.
- `fs_write_file`: Atomically writes file content to disk.
- `fs_create_file`: Validates and creates empty file without overwriting.
- `fs_create_directory`: Creates directory recursively.
- `fs_rename`: Renames file or directory with path collision checks.
- `fs_delete`: Recursively deletes directory or file.
- `fs_copy`: Recursively copies directories or files with descendant protection.
- `fs_move`: Moves files or directories safely across mounts.
- `fs_duplicate`: Generates duplicate file with safe numbering conflict resolution.
- `fs_search_workspace`: High-performance recursive workspace search with regex, case-sensitivity, whole-word matching, and include/exclude glob filtering.
- `fs_replace_in_files`: Safe multi-file text replacement applying edits from bottom-to-top to preserve line offsets.
- `fs_list_workspace_files`: Fast recursive file enumeration for Quick Open fuzzy search.

---

## Event Bus Architecture

Cross-module communication is orchestrated via typed event bus `ideEvents` in `lib/events.ts`:

```ts
import { ideEvents } from "@/lib/events";

// Open file from File Explorer or Search into Monaco Editor
ideEvents.on("file:open-requested", ({ path, line, column }) => {
  // Opens file in an editor tab and moves cursor to line/column
});

// Update editor tabs on file rename or delete
ideEvents.on("file:renamed", ({ oldPath, newPath }) => {
  // Updates open tab paths and re-binds Monaco models
});

ideEvents.on("file:deleted", ({ path }) => {
  // Closes associated tab and disposes Monaco model
});

// Search panel navigation
ideEvents.on("search:navigate-to-match", ({ path, line, column, length }) => {
  // Opens file and highlights matched range
});
```

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl+S` / `Cmd+S` | Save Active Document | Editor |
| `Ctrl+Alt+S` / `Cmd+Alt+S` | Save All Open Documents | Editor |
| `Ctrl+W` / `Cmd+W` | Close Active Tab | Editor |
| `Shift+Alt+F` | Format Document | Editor |
| `F12` | Go to Definition | Editor |
| `Alt+F12` | Peek Definition | Editor |
| `Shift+F12` | Find References | Editor |
| `Ctrl+P` / `Cmd+P` | Quick Open File | Global |
| `Ctrl+G` / `Cmd+G` | Go to Line | Editor |
| `Ctrl+Shift+F` | Open Workspace Search | Global |
| `Ctrl+F` | In-File Find | Editor |
| `Ctrl+H` | In-File Replace | Editor |
| `F2` | Rename File / Folder | File Explorer |
| `Delete` | Delete File / Folder | File Explorer |

---

## Testing

### Rust Backend Tests
Run in `src-tauri/`:
```bash
cargo test --lib
```
Includes 9 unit tests covering:
- Directory reading, sorting, and metadata
- File creation and duplicate collision resolution
- Safe descendant copy/move recursion prevention
- Path validation for existing and non-existing directories
- Safe file reading with binary detection
- Multi-threaded workspace search with case, whole-word, and regex modes
- Multi-file bottom-to-top text replacement

### Frontend Unit & Integration Tests
Run in project root:
```bash
npm test
```
Includes 61 unit tests across 8 test suites covering:
- Cross-platform path utilities (`joinPath`, `dirname`, `basename`, `isDescendant`)
- Filename validation against illegal characters and Windows reserved names
- Workspace creation, recent list deduplication, ordering, and capacity limits
- File explorer validation and boundary checks
- Language detection service for 50+ languages, extensions, and special files
- Formatter service registration, JSON formatting, and Monaco bridge
- Document loading, binary file protection, saving, and `saveAll` error isolation
- Search service filtering, match mapping, and replace request generation
