# Development Workflow

This document summarizes day-to-day commands, verification checks, testing conventions, and codebase rules for **Kairo IDE**.

## Available Commands

### Frontend (`package.json`)
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Next.js dev server (`next dev --webpack`) on port `3000` |
| `npm run build` | Produces static HTML/JS/CSS export in `out/` for Tauri bundling |
| `npm run lint` | Runs ESLint 9 (`eslint-config-next/core-web-vitals` + TypeScript) |
| `npm test` | Runs Vitest unit tests (`vitest run`) across `features/`, `components/`, and `lib/` |
| `npx tsc --noEmit` | Performs full TypeScript type checking |

### Desktop & Rust (`src-tauri/`)
| Command | Description |
| :--- | :--- |
| `npx tauri dev` | Starts Next.js dev server and attaches the native Tauri v2 desktop window |
| `npx tauri build` | Builds the frontend (`beforeBuildCommand`) and compiles release installers |
| `cargo check --manifest-path src-tauri/Cargo.toml --all-targets` | Typechecks Rust library, binary, and test targets |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Runs Rust unit tests (`49` unit tests covering FS, workspace, security, and terminal PTY/shells) |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Checks Rust code formatting |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` | Runs Rust static lints |

## Testing Conventions

### Vitest Configuration ([vitest.config.mts](../../vitest.config.mts))
- Discovers `**/*.test.ts` and `**/*.test.tsx` in Node environment with `@` aliased to the repository root.
- Uses `getSafeLocalStorage()` ([`lib/storage.ts`](../../lib/storage.ts)) to avoid Node 22+ `ExperimentalWarning` when `localStorage` is absent or polyfilled.
- Current test suites span:
  - `components/app-titlebar.test.ts`
  - `features/auth/services/*.test.ts`
  - `features/commands/*.test.ts`
  - `features/editor/**/*.test.ts`
  - `features/file-explorer/service.test.ts`
  - `features/icon-theme/resolver.test.ts`
  - `features/search/services/search.service.test.ts`
  - `features/settings/services/settings.service.test.ts`
  - `features/terminal/**/*.test.ts`
  - `features/theme/theme.test.ts`
  - `features/workspace/service.test.ts`
  - `lib/diff/diff-service.test.ts`, `lib/tauri-ipc.test.ts`

### Rust Tests
- **`src-tauri/src/commands/`**: FS CRUD, Unicode search/replace roundtrips, CRLF preservation, limits, cancellation, workspace open/switch/close, project detection.
- **`src-tauri/src/security/tests.rs`**: Path traversal, Windows junction/symlink escapes, prefix collisions, single-file grants, sensitive path policy, `asset://` protocol bounds, CSP check.
- **`src-tauri/src/terminal/tests.rs`**: Shell detection, custom profile validation, arg/executable/env sanitization, PTY spawn/teardown, poisoned mutex resilience.

## Framework & Architecture Rules

- **Next.js 16**: Consult `node_modules/next/dist/docs/` and preserve `AGENTS.md` / `CLAUDE.md` when updating Next.js APIs. Note that `next.config.ts` uses `output: "export"`, so server-only Next.js features (Route Handlers returning dynamic SSR responses, middleware, `next/image` optimization) are disabled.
- **IPC Boundaries**: Keep Tauri `invoke()` calls inside [`lib/tauri-ipc.ts`](../../lib/tauri-ipc.ts) or feature IPC services (such as `TerminalIpcService`) with clean browser-mode fallbacks.
- **Native Menu Accelerators**: On Windows and Linux, window decorations are disabled (`decorations: false` in `tauri.conf.json`) and keyboard shortcuts are dispatched centrally by [`KeybindingService`](../../features/commands/keybinding.service.ts). Native menu accelerators are intentionally attached only on macOS (`#[cfg(target_os = "macos")]` in `src-tauri/src/menu.rs`).

## Related Documentation

- [Development Setup](setup.md)
- [Troubleshooting](troubleshooting.md)
- [Build and Packaging](../release/build-and-packaging.md)
