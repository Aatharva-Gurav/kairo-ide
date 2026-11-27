# Kairo IDE

**Kairo IDE** is a cross-platform desktop code editor engineered with **Next.js 16**, **React 19**, **TypeScript**, **Monaco Editor**, **xterm.js**, and a **Tauri v2 (Rust)** native backend. It pairs a modern, themeable workbench UI with a native filesystem security boundary (`WorkspaceGuard` + `SensitivePathPolicy`) and real OS PTY terminal sessions.

---

## Core Features

### 1. Code Editor & Floating Creation (`features/editor/`)
- Multi-tab Monaco Editor workbench with binary-file preview (`BinaryFileView`), breadcrumbs, and interactive status bar (`Ln/Col`, selection count, line endings, language label, zoom, formatting).
- Horizontal and vertical 2-pane split views (`Ctrl+\`, `Ctrl+K Ctrl+\`) with draggable dividers and active-pane focus tracking.
- Disk-to-buffer synchronization & conflict resolution (`BufferSyncService` + `DiffService`), preserving CRLF/LF line endings cleanly.
- Draggable in-editor Find & Replace widget (`Ctrl+F` / `Ctrl+H`), Go to Line (`Ctrl+G`), Quick Open (`Ctrl+P`), JSON formatter provider, built-in snippets (`IntelliSenseService`), and Floating Creation quick-add menu when the sidebar is collapsed.

### 2. Integrated Terminal (`features/terminal/`, `src-tauri/src/terminal/`)
- Multi-tab and split-pane terminal powered by `xterm.js` (`FitAddon`, `SearchAddon`, `WebLinksAddon`, `Unicode11Addon`, optional `WebglAddon`) backed by real OS ConPTY / POSIX PTY sessions via `portable-pty`.
- Automatic shell profile discovery (PowerShell 7, Windows PowerShell, CMD, Git Bash, WSL, zsh, bash, fish, sh, etc.) and custom profile sync validated against allowlisted shell binaries and blocked environment variables.
- Clickable `file:line:col` links (`TerminalLinkProvider`) opening directly in the editor, local dev-server URL detection (`DevServerDetector`), persistent panel height, maximize mode (`Alt+F11`), and state preservation when toggling visibility (``Ctrl+` ``).

### 3. Workspace Management & File Explorer (`features/workspace/`, `features/file-explorer/`)
- Explicit workspace lifecycle (`OPEN` / `CLOSING` / `CLOSED`) with unsaved-document close hooks, project technology detection, multi-root backend support, and recent workspaces history.
- Lazy-loaded directory tree with in-memory caching, compact single-child folder folding, inline create/rename, multi-select, batch rename, move modal, 30-step undo/redo history (`ExplorerHistoryService`), context menu actions, tree filter (`Ctrl+F` when focused), and OS window drag-and-drop.

### 4. Workspace-Wide Search & Replace (`features/search/`, `src-tauri/src/commands/fs.rs`)
- Debounced workspace search executed in Rust via `spawn_blocking` with Case Sensitive (`Alt+C`), Whole Word (`Alt+W`), Regex (`Alt+R`), and Include/Exclude glob pattern filters.
- Atomic workspace-wide multi-file replacements with confirmation modal and line/column jump navigation.

### 5. Commands, Keybindings & Live Settings (`features/commands/`, `features/command-palette/`, `features/settings/`)
- Central `CommandRegistry` with fuzzy Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
- Capture-phase global `KeybindingService` supporting cross-platform `Ctrl`/`Cmd` normalization, shifted physical key mappings, two-step chords (`Ctrl+K ...`), focus-aware `when` clauses (`terminalFocus`, `editorTextFocus`, `explorerFocus`), conflict detection, and custom shortcut recording.
- User- and workspace-scoped Settings modal (`Ctrl+,` / `Cmd+,`) spanning **Appearance**, **Editor**, **Suggestions**, **Terminal**, **Files**, **Search**, and **Keybindings**.

### 6. Themes, Icon Theme & Optional Supabase Auth (`features/theme/`, `features/icon-theme/`, `features/auth/`, `features/onboarding/`)
- **14 built-in VS Code-inspired themes** (7 dark: `dark-modern`, `dark-plus`, `vs-dark`, `hc-dark`, `midnight-blue`, `graphite`, `forest-dark`; 7 light: `light-modern`, `light-plus`, `vs-light`, `hc-light`, `arctic-blue`, `warm-sand`, `mint-light`) plus OS `"system"` mode and pre-hydration anti-flash script (`public/theme-init.js`).
- Cached multi-priority file/folder icon resolver (`@icons-pack/react-simple-icons` + SVG folders).
- Optional Supabase cloud authentication (`public.profiles` + RLS + onboarding wizard) with seamless automatic fallback to **Offline Mode** when unconfigured.

---

## Architecture & Security Highlights

- **Workspace Boundary (`WorkspaceGuard`)**: Enforces authorized workspace roots, single-file grants from native Open/Save-As dialogs, monotonic workspace generations, and blocks path traversal (`..`), UNC/device paths, symlinks, NTFS junctions, and prefix collisions.
- **Sensitive Path Protection (`SensitivePathPolicy`)**: Blocks `.env*`, `.git/*`, `.ssh`, `.gnupg`, `.aws`, `.kube`, `.docker`, `.azure`, `.gcloud`, `secrets/`, private keys (`*.pem`, `*.key`, `id_rsa*`, etc.), and credential files from IDE filesystem APIs.
- **Custom `asset://` Range Protocol**: Serves media previews strictly within authorized workspace boundaries with empty declarative Tauri asset scope (`scope: []`).
- **Hardened Production CSP (`src-tauri/tauri.conf.json`)**:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset: http://asset.localhost https://asset.localhost; media-src 'self' asset: http://asset.localhost https://asset.localhost; font-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`

For deeper technical details, see [docs/architecture/architecture-overview.md](docs/architecture/architecture-overview.md).

---

## Repository Structure

```text
kairo-ide/
├── app/               # Next.js App Router routes (/, /login, /signup, /onboarding), layout, CSS
├── components/        # Frameless titlebar, floating sidebar, auth guard, drag-drop, shadcn/ui primitives
├── features/          # Feature modules (auth, command-palette, commands, editor, file-explorer,
│                      #   icon-theme, onboarding, search, settings, terminal, theme, workspace)
├── lib/               # Tauri IPC bridge, event bus (ideEvents), DiffService, Supabase client, storage/worker utils
├── public/            # Static icons & client scripts (icon.png, favicon.ico, theme-init.js, monaco-worker.js)
├── src-tauri/         # Tauri v2 config, capabilities & Rust backend (commands, security, terminal, menu)
├── supabase/          # PostgreSQL profiles schema, RLS policies & auth triggers
└── docs/              # Centralized architecture, feature, development & release documentation
```

See [docs/architecture/project-structure.md](docs/architecture/project-structure.md) for the complete module map.

---

## Documentation Directory

- [**Documentation Home**](docs/README.md)
- **Architecture**: [Overview](docs/architecture/architecture-overview.md) · [Project Structure](docs/architecture/project-structure.md)
- **Features**:
  [Terminal](docs/features/terminal/README.md) ·
  [Editor](docs/features/editor/README.md) ·
  [File Explorer](docs/features/file-explorer/README.md) ·
  [Workspace](docs/features/workspace/README.md) ·
  [Search](docs/features/search/README.md) ·
  [Commands & Keybindings](docs/features/commands/README.md) ·
  [Settings](docs/features/settings/README.md) ·
  [Themes](docs/features/theme/README.md) ·
  [Icon Theme](docs/features/icon-theme/README.md) ·
  [Auth](docs/features/auth/README.md) ·
  [Onboarding](docs/features/onboarding/README.md)
- **Development**: [Setup](docs/development/setup.md) · [Workflow](docs/development/development-workflow.md) · [Troubleshooting](docs/development/troubleshooting.md)
- **Release**: [Build & Packaging](docs/release/build-and-packaging.md)

---

## Getting Started

### Prerequisites
- **Node.js 20+** and **npm**
- **Rust & Cargo** (`rustup`)
- Platform **Tauri v2** prerequisites (WebView2 + C++ Build Tools on Windows, Xcode CLI tools on macOS, WebKitGTK dev libraries on Linux)

### Install & Run

```bash
# 1. Install Node dependencies
npm install

# 2. Launch native desktop application (Next.js + Tauri v2 + Rust PTY)
npx tauri dev

# Or run frontend-only browser mode (uses browser mock fallbacks)
npm run dev
```

*(Optional Supabase Auth)*: Create `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then apply [the database migration](supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql). Without Supabase configuration, Kairo IDE launches directly in local **Offline Mode**.

---

## Default Keyboard Shortcuts

| Windows / Linux | macOS | Action | Context |
| :--- | :--- | :--- | :--- |
| `Ctrl+Shift+P` | `Cmd+Shift+P` | Command Palette | Global |
| `Ctrl+P` | `Cmd+P` | Quick Open File | Global |
| `Ctrl+,` | `Cmd+,` | Open Settings | Global |
| `Ctrl+K Ctrl+S` | `Cmd+K Cmd+S` | Keyboard Shortcuts | Global |
| `Ctrl+B` | `Cmd+B` | Toggle Sidebar | Global |
| `Ctrl+Shift+E` | `Cmd+Shift+E` | Focus File Explorer | Global |
| `Ctrl+Shift+F` | `Cmd+Shift+F` | Find in Workspace | Global |
| `Ctrl+O` / `Ctrl+Shift+O` | `Cmd+O` / `Cmd+Shift+O` | Open File / Open Folder | Global |
| `Ctrl+K F` | `Cmd+K F` | Close Workspace | Global |
| `Ctrl+N` / `Ctrl+S` / `Ctrl+Shift+S` | `Cmd+N` / `Cmd+S` / `Cmd+Shift+S` | New File / Save / Save All | Global |
| `Ctrl+W` / `Ctrl+K Ctrl+W` | `Cmd+W` / `Cmd+K Cmd+W` | Close Editor / Close All | Global |
| `Ctrl+\` / `Ctrl+K Ctrl+\` | `Cmd+\` / `Cmd+K Cmd+\` | Split Editor Right / Down | Global |
| `Ctrl+F` / `Ctrl+H` / `Ctrl+G` | `Cmd+F` / `Cmd+H` / `Cmd+G` | Find / Replace / Go to Line | Editor / Focused |
| `Shift+Alt+F` | `Shift+Alt+F` | Format Document | Editor |
| ``Ctrl+` `` / ``Ctrl+Shift+` `` | ``Cmd+` `` / ``Cmd+Shift+` `` | Toggle Terminal / New Terminal | Global |
| `Ctrl+Shift+5` / `Ctrl+Shift+W` | `Cmd+Shift+5` / `Cmd+Shift+W` | Split Terminal / Close Terminal | Global |
| `Alt+F11` | `Alt+F11` | Maximize/Restore Terminal Panel | Global |
| `Ctrl+K` / `Ctrl+F` | `Cmd+K` / `Cmd+F` | Clear Terminal / Terminal Find | `terminalFocus` |
| `Ctrl+F` | `Cmd+F` | Filter Explorer Tree | `explorerFocus` |

---

## Verification & Testing Commands

```bash
# Frontend typecheck, lint, and unit tests (25 test files / 251 Vitest tests)
npx tsc --noEmit
npm run lint
npm test

# Rust checks and unit tests (49 Cargo unit tests)
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets

# Production desktop installer build
npx tauri build
```

---

## License

No `LICENSE` file is currently included in this repository. Add your preferred license file at the project root before public distribution.
