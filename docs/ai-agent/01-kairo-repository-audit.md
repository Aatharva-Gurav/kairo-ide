# 01 — Kairo IDE Complete Repository Audit

## Executive Summary

Kairo IDE is a desktop integrated development environment engineered with a hybrid architecture:
- **Frontend**: Next.js 16 (`^16.4.3`), React 19 (`^19.3.1`), TypeScript 5, Tailwind CSS v4, Monaco Editor (`^0.57.0`), and Base UI / shadcn primitives.
- **Backend / Host**: Tauri v2 (`^2.12.5`), Rust (2021 edition), with native filesystem commands, custom frameless window management, and native context menus.
- **IPC Architecture**: Custom typed IPC bridge (`lib/tauri-ipc.ts`) backed by Tauri's `invoke` mechanism with an in-browser virtual filesystem (VFS) fallback for web-based development.
- **Testing**: 169 Vitest tests passing across 18 test files; 12 Cargo unit tests passing in Rust.

---

## 1. Repository Inventory & Categorization

The repository consists of 196 tracked files organized into clear boundaries:

| Category | File Paths / Directories | Purpose |
| :--- | :--- | :--- |
| **1. Application Frontend Source** | `app/`, `components/`, `features/`, `lib/` | Next.js 16 App Router frontend, Monaco editor subsystem, UI components, state stores. |
| **2. Native Rust Code** | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/menu.rs`, `src-tauri/src/commands/**` | Native Tauri backend executing OS filesystem operations, native dialogs, and native menu popups. |
| **3. Configuration** | `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json` | Tooling, build, packaging, compiler, and capability configuration. |
| **4. Tests** | `**/*.test.ts`, `src-tauri/src/commands/fs.rs` (inline `mod tests`), `src-tauri/src/commands/workspace.rs` (inline `mod tests`) | 18 Vitest suites (169 tests) + 12 Cargo unit tests. |
| **5. Build & Setup Scripts** | `src-tauri/build.rs`, npm scripts in `package.json` | Build-time Tauri code generation and Next.js export commands. |
| **6. Database & Migrations** | `supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql` | Supabase Postgres schema for user profiles and auth triggers. |
| **7. Static Assets** | `public/**`, `src-tauri/icons/**` | Brand logos, favicons, window icon sets. |
| **8. Excluded Build Artifacts** | `node_modules/`, `.next/`, `out/`, `src-tauri/target/`, `tsconfig.tsbuildinfo` | Transpiled artifacts, incremental compiler caches, and cargo binaries. |

---

## 2. Package Manager and Runtime Environment

- **Package Manager**: `npm` (determined by the authoritative `package-lock.json` lockfile in the repository root).
- **Node.js Environment**: Configured with `@types/node: ^20`.
- **Target OS**: Windows (tested on Windows 11 with PowerShell host).
- **Scripts in `package.json`**:
  - `npm run dev`: Runs `next dev` (development server).
  - `npm run build`: Runs `next build` (generates static export in `out/`).
  - `npm run start`: Runs `next start`.
  - `npm run lint`: Runs `eslint`.
  - `npm test`: Runs `vitest run`.

---

## 3. Frontend Architecture

### 3.1 Next.js Configuration (`next.config.ts`)
```typescript
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "@icons-pack/react-simple-icons", "@base-ui/react"],
  },
};
```
- **Crucial Characteristic**: `output: "export"`.
  - The Next.js frontend is compiled into a completely static single-page application placed in `out/`.
  - Tauri loads `frontendDist: "../out"` in production, and connects to `devUrl: "http://localhost:3000"` in development.
  - Because `output: "export"` is enforced, **no server-side Node.js APIs (such as `fs`, `child_process`, `net`) can execute directly inside the Next.js frontend bundle**. Any backend capability MUST communicate via Tauri IPC or an external process/WebSocket sidecar.

### 3.2 TypeScript Configuration (`tsconfig.json`)
- Target: `ES2017`.
- Module: `esnext` with `moduleResolution: "bundler"`.
- Strict mode: `true`.
- Path aliases: `@/*` mapped to `./*`.

### 3.3 Styling & Design System
- **Tailwind CSS**: Tailwind v4 (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`, `tw-animate-css`).
- **Base UI & Radix Primitives**: `@base-ui/react: ^1.9.0`, `class-variance-authority`, `cn` helper.
- **Theme Injection**: An inline script in `<head>` of `app/layout.tsx` synchronously inspects `localStorage.getItem('kairo:user_settings')` before hydration, resolves legacy theme migration keys, checks system color scheme preferences, and injects `class="dark"` / `class="kairo-dark"` / `class="kairo-light"` and `data-theme="..."` directly onto `document.documentElement` to eliminate theme flickering.

---

## 4. Subsystem Audits

### 4.1 Application Lifecycle & Layout Hierarchy
1. **Boot (`app/layout.tsx`)**:
   - `RootLayout` mounts: `ErrorBoundaryGuard` -> `AuthProvider` -> `WorkspaceProvider` -> `SettingsProvider`.
2. **Page View (`app/page.tsx`)**:
   - Protected by `AuthGuard`.
   - Wraps UI in: `IconThemeProvider` -> `FileExplorerProvider` -> `EditorProvider` -> `SearchProvider` -> `SidebarProvider` -> `CommandProvider`.
   - Renders:
     - `AppTitleBar` (custom frameless draggable titlebar with window minimize/maximize/close, global menu popups, search trigger, profile menu).
     - Main layout: `PageContent` (renders `EditorWorkspace` if a workspace or document is active, else `Empty` welcome state) + `AppSidebar` (docked on the right by default with `Explorer` and `Search` tabs, plus a footer for `Settings`).

### 4.2 Workspace Subsystem (`features/workspace/`)
- **State Store**: `WorkspaceProvider` (`features/workspace/store.tsx`).
- **Service**: `WorkspaceService` (`features/workspace/service.ts`).
- **Responsibilities**:
  - Picking directories via native OS dialogs (`workspace_pick_folder`).
  - Path normalization through `normalizePath()`.
  - Validating workspace existence on disk (`workspace_validate_path`).
  - Auto-detecting project characteristics (e.g. Node.js, TypeScript, Rust, Python, Go, Next.js, Tauri).
  - Maintaining MRU list of `recentWorkspaces` with storage persistence.
  - Emitting decoupled lifecycle events (`workspace:opened`, `workspace:closed`, `workspace:switched`) through `ideEvents`.

### 4.3 Filesystem & IPC Subsystem (`lib/tauri-ipc.ts`)
- **Tauri Detection**: Checks for `window.__TAURI_INTERNALS__` or `window.__TAURI__`.
- **Command Invocation**: Calls `@tauri-apps/api/core` `invoke<T>(command, args)`.
- **In-Browser VFS Fallback**: When run outside Tauri (pure web browser), routes operations to `handleBrowserVfsCommand`, which persists an in-memory virtual filesystem to `localStorage["kairo:vfs_files"]`.
- **Path Utilities**: Rigorous cross-platform path functions: `normalizePath`, `basename`, `dirname`, `joinPath`, `relativePath`, `isDescendant`, `normalizeSelection`, `validateFileName`.
- **Error Handling**: Structured `FileSystemError` class with normalized codes (`NOT_FOUND`, `PERMISSION_DENIED`, `ALREADY_EXISTS`, `INVALID_PATH`, `NOT_DIRECTORY`, `LOCKED`, `DESCENDANT_OPERATION`, `UNKNOWN`).

### 4.4 Monaco Editor Subsystem (`features/editor/`)
- **Monaco Engine**: Bundled locally (`monaco-editor: ^0.57.0`, `@monaco-editor/react: ^4.7.0`).
- **Model Lifecycle (`ModelService` in `features/editor/services/model.service.ts`)**:
  - Strict 1:1 mapping between file URI (`monaco.Uri.file(...)`) and `ITextModel`.
  - Reuses active models without recreating or leaking memory.
  - `saveViewState` and `restoreViewState` preserve cursor selections and scroll offsets during tab switches.
  - Explicit model disposal (`model.dispose()`) when tabs close.
- **Document Management**:
  - Dirty state tracking (`isDirty`).
  - Unsaved close confirmation modal (`DirtyCloseConfirmAction`: Save, Don't Save, Cancel).
  - Split view support: single, horizontal split, vertical split (`splitRatio`, `splitDirection`).
  - Format document service (`FormatterService`).
  - Go to Line modal (`Ctrl+G`), Quick Open modal (`Ctrl+P`).
  - Binary file detection (null-byte heuristic) and native preview for images (`.png`, `.jpg`, `.svg`, etc.).

### 4.5 File Explorer Subsystem (`features/file-explorer/`)
- **State Store**: `FileExplorerProvider` (`features/file-explorer/store.tsx`).
- **Service**: `FileExplorerService` (`features/file-explorer/service.ts`).
- **Capabilities**:
  - Lazy directory loading via `fs_read_directory`.
  - Context menu with Rename, Delete, Duplicate, Cut, Copy, Paste, Reveal in OS Explorer.
  - File filtering, search bar, and batch operations.
  - Circular move prevention (`isDescendant` check).

### 4.6 Terminal & PTY Implementation Status
- **Audit Finding**: In the existing Kairo IDE codebase, **there is currently NO terminal or PTY backend implementation**.
- While the `README.md` documents a planned collapsible dock with terminal, the only terminal references in the code are:
  1. A Lucide icon import in `features/command-palette/components/command-palette-modal.tsx`.
  2. A comment in `lib/events.ts` line 3: `"Enables future features (Monaco Editor, Git, Terminal, AI Assistant, etc.)"`.
- There are no PTY crates (e.g. `portable-pty`) in `Cargo.toml`, nor `xterm.js` in `package.json`.

### 4.7 Authentication & Offline Guest Mode (`features/auth/`)
- **State Store**: `AuthProvider` (`features/auth/store.tsx`).
- **Services**: `AuthService` (`services/auth.service.ts`), `ProfileService` (`services/profile.service.ts`).
- **Supabase Integration**: Optional. When `NEXT_PUBLIC_SUPABASE_URL` is omitted or contains placeholder strings, `isSupabaseConfigured()` returns false.
- **Offline Guest Fallback**: If Supabase is unconfigured or the user explicitly clicks "Continue as Guest", the IDE initializes with `status = "offline"`, profile = `offlineProfile`, and `SettingsService.setUser("local")`. The IDE is 100% functional offline without cloud connectivity.

### 4.8 Settings Subsystem (`features/settings/`)
- **Settings Registry**: `SETTINGS_REGISTRY` (`features/settings/registry.ts`) defines 7 categories: Appearance, Editor, Files, Explorer, Search, Keyboard, Suggestions.
- **Storage**: Uses `getSafeLocalStorage()` (`lib/storage.ts`) to avoid Node 22 experimental localStorage warnings during tests or SSR.
- **Scoped Settings**: Supports global defaults and user-scoped overrides.

### 4.9 Theme Subsystem (`features/theme/`)
- **Registry**: 14 built-in themes defined in `features/theme/registry.ts`:
  `dark-modern`, `dark-plus`, `vs-dark`, `hc-dark`, `midnight-blue`, `graphite`, `forest-dark`, `light-modern`, `light-plus`, `vs-light`, `hc-light`, `arctic-blue`, `warm-sand`, `mint-light`.
- **Monaco Synchronization**: Theme definitions configure both CSS variables and Monaco editor token color rules.
- **Native Sync**: Emits `window_set_theme` to Tauri to update native window caption bar tone.

### 4.10 Decoupled Event Bus (`lib/events.ts`)
- A centralized, strongly-typed singleton `ideEvents` implements publish-subscribe across subsystems:
  - Workspace: `workspace:opened`, `workspace:closed`, `workspace:changed`, `workspace:switched`.
  - Files: `file:selected`, `file:open-requested`, `file:created`, `file:renamed`, `file:deleted`, `file:moved`, `file:copied`, `file:content-changed`.
  - Editor: `editor:document-opened`, `editor:document-closed`, `editor:document-saved`, `editor:document-changed`, `editor:active-changed`, `editor:reveal-in-explorer`.
  - UI: `sidebar:switch-tab`, `search:navigate-to-match`.

---

## 5. Native Rust Backend Architecture (`src-tauri/`)

### 5.1 Cargo Configuration (`src-tauri/Cargo.toml`)
- Crate name: `app_lib` (library) and `app` (binary).
- Dependencies:
  - `tauri = { version = "2.12.5" }`
  - `tauri-plugin-log = "2"`
  - `serde = { version = "1.0", features = ["derive"] }`
  - `serde_json = "1.0"`
  - `log = "0.4"`
  - `rfd = "0.15"` (Rust File Dialog for native folder/file pickers)
- Profiles: Release uses `opt-level = 3`, `lto = "thin"`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.

### 5.2 Tauri Configuration (`src-tauri/tauri.conf.json`)
- Product: `kairo-ide`, version `0.1.0`, bundle identifier `com.kairo.ide`.
- Build commands: `beforeDevCommand: "npm run dev"`, `beforeBuildCommand: "npm run build"`, `frontendDist: "../out"`, `devUrl: "http://localhost:3000"`.
- Window configuration:
  - `decorations: false`: Frameless window requiring frontend titlebar and window control IPC.
  - `maximized: true`, `resizable: true`, `minWidth: 800`, `minHeight: 600`.
- Security & CSP:
  - `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: filesystem:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:3000 ws://localhost:3000 https: wss:; worker-src 'self' blob:;`
  - **Important CSP finding**: `connect-src` explicitly allows `https:`, `wss:`, and `http://localhost:*` / `ws://localhost:*`.

### 5.3 Rust Commands Exported (`src-tauri/src/lib.rs`)
The Tauri builder registers 25 native commands via `tauri::generate_handler!`:

```rust
// Workspace Dialogs & Detection
workspace_pick_folder
workspace_pick_file
workspace_save_file_as
workspace_validate_path
workspace_detect_project

// Native Filesystem Operations
fs_read_directory
fs_create_file
fs_create_directory
fs_rename
fs_delete
fs_copy
fs_move
fs_duplicate
fs_reveal
fs_exists
fs_get_metadata
fs_read_file
fs_write_file
fs_search_workspace
fs_replace_in_files
fs_list_workspace_files

// Native Context Menus & Workspaces
menu_popup
menu_sync_recent_workspaces

// Window State Management
window_minimize
window_toggle_maximize
window_close
window_is_maximized
window_set_theme
```

### 5.4 Native Menu Management (`src-tauri/src/menu.rs`)
- Implements `AppMenus` containing native submenus: File, Edit, Selection, View, Help, and Recent Workspaces.
- Supports native popup positioning at exact screen coordinates via `menu_popup`.
- Updates the native "Open Recent" submenu dynamically via `menu_sync_recent_workspaces`.

---

## 6. Verification and Test Results

Before auditing reference architectures, the existing test suites were executed to verify system health:

- **Vitest**:
  - Test files: 18 passed (18 total).
  - Tests: 169 passed (169 total).
  - Duration: 23.04s.
- **Cargo Test**:
  - Crate `app_lib`: 12 passed (12 total).
  - Duration: 0.03s execution time.
- **Git Working Tree**: Verified clean on branch `main`.
