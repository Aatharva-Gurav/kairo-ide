# Kairo IDE — Project Structure

This document maps the actual directory layout of **Kairo IDE** across the Next.js frontend, shared libraries, feature modules, Tauri v2 Rust backend, database schema, and documentation.

## Repository Root Layout

```text
kairo-ide/
├── app/                         # Next.js App Router pages, layout, styles, favicon
├── components/                  # App-wide shell components & shadcn/Base UI primitives
├── features/                    # Domain-organized frontend feature modules
├── lib/                         # Core frontend utilities, IPC bridge, event bus, diff & Supabase clients
├── public/                      # Static assets & client initialization scripts
├── src-tauri/                   # Tauri v2 desktop configuration, capabilities, icons & Rust backend
├── supabase/                    # PostgreSQL migrations for user profiles & RLS triggers
├── docs/                        # Centralized project, architecture, feature & release documentation
├── AGENTS.md / CLAUDE.md        # Next.js agent development notice
├── components.json              # shadcn/ui configuration
├── eslint.config.mjs            # ESLint 9 configuration (next core-web-vitals + typescript)
├── next.config.ts               # Static export Next.js config (`output: "export"`)
├── package.json                 # Frontend scripts and npm dependencies
├── postcss.config.mjs           # Tailwind CSS v4 PostCSS plugin configuration
├── tsconfig.json                # TypeScript compiler options & `@/*` path alias
├── vitest.config.mts            # Vitest test runner configuration
└── README.md                    # Main repository entry point
```

## Directory Breakdown

### `app/` — Next.js App Router
| File | Purpose |
| :--- | :--- |
| `app/layout.tsx` | Root HTML/body layout, metadata/icons, `ErrorBoundaryGuard`, `AuthProvider`, `theme-init.js` bootstrap |
| `app/page.tsx` | Primary IDE workbench composing all feature providers inside `AuthGuard` |
| `app/login/page.tsx` | User sign-in route with redirect when already authenticated or offline |
| `app/signup/page.tsx` | Account registration route |
| `app/onboarding/page.tsx` | Four-step post-signup onboarding route |
| `app/globals.css` | Tailwind v4 styles, semantic CSS variables, font/theme styling |
| `app/favicon.ico` | Application icon served by Next.js App Router |

### `components/` — Shared UI & Application Chrome
| Path | Purpose |
| :--- | :--- |
| `components/app-titlebar.tsx` | Custom frameless window title bar, interactive menu bar, workspace indicator, terminal/settings triggers |
| `components/app-sidebar.tsx` | Floating collapsible right sidebar switching between File Explorer and Workspace Search |
| `components/auth-guard.tsx` | Route protection redirecting unauthenticated or non-onboarded users |
| `components/error-boundary-guard.tsx` | Global `unhandledrejection` and worker/script `ErrorEvent` guard |
| `components/kairo-brand-icon.tsx` | Renders `/icon.png` brand logo with optional animation |
| `components/login-form.tsx` | Email/password login, password reset, and Offline Mode entry UI |
| `components/signup-form.tsx` | Registration UI with validation and verification handling |
| `components/tauri-drag-drop-listener.tsx` | Native OS drag-and-drop & browser drop router (copy to explorer vs open in editor) |
| `components/ui/` | Reusable primitives (`breadcrumb`, `button`, `empty`, `field`, `input`, `label`, `separator`, `sidebar`, `skeleton`, `tooltip`) |

### `features/` — Feature Modules
| Directory | Documentation | Scope |
| :--- | :--- | :--- |
| `features/auth/` | [Auth Docs](../features/auth/README.md) | Supabase auth session management, error mapping, profile sync, offline mode |
| `features/command-palette/` | [Commands Docs](../features/commands/README.md) | Modal command palette UI (`>` prefix, fuzzy search, shortcut badges) |
| `features/commands/` | [Commands Docs](../features/commands/README.md) | `CommandRegistry`, `KeybindingService` (chords, contexts, custom bindings), `fuzzyFilter` |
| `features/editor/` | [Editor Docs](../features/editor/README.md) | Multi-tab Monaco editor, split panes, buffer sync, formatting, IntelliSense, floating creation |
| `features/file-explorer/` | [File Explorer Docs](../features/file-explorer/README.md) | Lazy directory tree, cache, undo/redo history, drag-drop, multi-select, batch rename, context menu |
| `features/icon-theme/` | [Icon Theme Docs](../features/icon-theme/README.md) | Cached file/folder/extension/pattern icon resolution & SVG/brand icon rendering |
| `features/onboarding/` | [Onboarding Docs](../features/onboarding/README.md) | 4-step wizard (profile, languages, theme, editor defaults) persisted to Supabase or localStorage |
| `features/search/` | [Search Docs](../features/search/README.md) | Workspace-wide search, regex/case/whole-word/glob filters, batch replace |
| `features/settings/` | [Settings Docs](../features/settings/README.md) | Typed settings registry, user + workspace storage scoping, live modal editor |
| `features/terminal/` | [Terminal Docs](../features/terminal/README.md) | Multi-tab & split `xterm.js` terminal backed by Rust PTY sessions |
| `features/theme/` | [Themes Docs](../features/theme/README.md) | 14 built-in themes + `system` + CSS token injection + Monaco theme sync |
| `features/workspace/` | [Workspace Docs](../features/workspace/README.md) | Workspace lifecycle (`OPEN`/`CLOSING`/`CLOSED`), multi-root, recent history, close hooks |

### `lib/` — Core Libraries
| Path | Purpose |
| :--- | :--- |
| `lib/app-metadata.ts` | Reads Kairo IDE and Monaco versions from `package.json` / `NEXT_PUBLIC_*` env vars |
| `lib/diff/` | `DiffService` line diff computation, unified formatting, hunk application, conflict detection |
| `lib/events.ts` | Typed pub/sub `ideEvents` bus connecting IDE subsystems |
| `lib/monaco-worker-stub.ts` | Client-side Blob `Worker` interceptor + global error suppression for Monaco in static/CSP builds |
| `lib/storage.ts` | SSR/Vitest-safe `getSafeLocalStorage()` helper avoiding Node experimental warnings |
| `lib/supabase/` | `getSupabaseClient()`, config validation, and generated `Database` types |
| `lib/tauri-ipc.ts` | Sandboxed wrapper for all Tauri workspace, FS, search, dialog, and external URL commands + path utils |
| `lib/utils.ts` | Re-exports `cn` helper |
| `lib/watcher.ts` | `PluggableFileSystemWatcher` abstraction for filesystem change notifications |

### `public/` — Static Assets & Boot Scripts
| File | Purpose |
| :--- | :--- |
| `public/favicon.ico` | Static favicon copy aligned with `app/layout.tsx` metadata |
| `public/icon.png` | Primary Kairo IDE logo displayed by `KairoBrandIcon` and metadata |
| `public/monaco-worker.js` | Minimal fallback Web Worker script for Monaco environments |
| `public/theme-init.js` | Pre-hydration inline script preventing dark/light flicker on launch |

### `src-tauri/` — Native Tauri v2 & Rust Backend
| Path | Purpose |
| :--- | :--- |
| `src-tauri/Cargo.toml` / `Cargo.lock` | Rust crate dependencies (`tauri`, `portable-pty`, `rfd`, `walkdir`, `regex`, `globset`, `serde`, `uuid`, etc.) |
| `src-tauri/tauri.conf.json` | Window configuration (`decorations: false`, maximized `1280x820`), strict CSP, bundle settings |
| `src-tauri/capabilities/default.json` | Main window minimize/maximize/close/drag Tauri ACL permissions |
| `src-tauri/src/lib.rs` | App builder, state injection (`WorkspaceGuard`, `TerminalManager`, `AppMenusState`), command handler & `asset://` protocol |
| `src-tauri/src/main.rs` | Desktop binary entrypoint invoking `app_lib::run()` |
| `src-tauri/src/menu.rs` | Native macOS menu bar, Windows/Linux context menu popup, recent workspace menu sync |
| `src-tauri/src/commands/workspace.rs` | Workspace open/close, multi-root add/remove, folder/file pickers, project type detection |
| `src-tauri/src/commands/fs.rs` | Sandboxed directory reads, file I/O, search/replace, file listing, metadata, OS file manager reveal |
| `src-tauri/src/security/` | `WorkspaceGuard`, `SensitivePathPolicy`, `asset_protocol.rs`, `FsSecurityError`, and security test suite |
| `src-tauri/src/terminal/` | `TerminalManager`, `TerminalSession` (`portable-pty`), shell discovery & validation, terminal commands & tests |

## Related Documentation

- [Architecture Overview](architecture-overview.md)
- [Documentation Index](../README.md)
