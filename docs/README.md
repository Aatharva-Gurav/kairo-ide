# Kairo IDE Documentation

Welcome to the centralized documentation for **Kairo IDE** — a cross-platform desktop code editor built with **Next.js 16**, **React 19**, **TypeScript**, **Monaco Editor**, **xterm.js**, and **Tauri v2 (Rust)**.

## Architecture & Repository Layout

- [Architecture Overview](architecture/architecture-overview.md) — Frontend provider layering, `ideEvents` bus, `WorkspaceGuard` & `SensitivePathPolicy`, PTY sandboxing, custom `asset://` streaming, and dual desktop/browser execution.
- [Project Structure](architecture/project-structure.md) — Directory map covering `app/`, `components/`, `features/`, `lib/`, `public/`, `src-tauri/`, and `supabase/`.

## Feature Documentation

Every document below maps directly to its implemented module under `features/`:

| Feature | Module | Documentation |
| :--- | :--- | :--- |
| Integrated Terminal | `features/terminal/`, `src-tauri/src/terminal/` | [Integrated Terminal](features/terminal/README.md) |
| Code Editor & Floating Creation | `features/editor/` | [Code Editor](features/editor/README.md) |
| File Explorer | `features/file-explorer/` | [File Explorer](features/file-explorer/README.md) |
| Workspace Management | `features/workspace/`, `src-tauri/src/commands/workspace.rs` | [Workspace Management](features/workspace/README.md) |
| Workspace Search & Replace | `features/search/`, `src-tauri/src/commands/fs.rs` | [Search & Replace](features/search/README.md) |
| Commands & Keybindings | `features/commands/`, `features/command-palette/` | [Commands & Keybindings](features/commands/README.md) |
| Settings | `features/settings/` | [Settings](features/settings/README.md) |
| Themes | `features/theme/` | [Themes](features/theme/README.md) |
| Icon Theme | `features/icon-theme/` | [Icon Theme](features/icon-theme/README.md) |
| Authentication | `features/auth/`, `lib/supabase/`, `supabase/` | [Authentication](features/auth/README.md) |
| Onboarding | `features/onboarding/` | [Onboarding](features/onboarding/README.md) |

## Development & Release Guides

- [Development Setup](development/setup.md) — Prerequisites (Node.js, Rust, Tauri dependencies), optional Supabase env config, and running in Tauri vs browser mode.
- [Development Workflow](development/development-workflow.md) — Daily npm/Vitest/ESLint/Cargo commands, testing conventions, and architecture guidelines.
- [Troubleshooting](development/troubleshooting.md) — Solutions for mock vs PTY terminal mode, shell validation, security boundary errors, Monaco workers, and Offline Mode.
- [Build and Packaging](release/build-and-packaging.md) — Next.js static export (`out/`), Tauri release installer bundling, and production CSP configuration.
