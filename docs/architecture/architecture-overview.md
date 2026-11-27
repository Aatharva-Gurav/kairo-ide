# Kairo IDE — Architecture Overview

Kairo IDE is a cross-platform desktop code editor built with a **Next.js 16 + React 19 + TypeScript** frontend wrapped in a **Tauri v2 + Rust** native host. The frontend is statically exported (`output: "export"`) for desktop packaging while preserving browser-mode fallbacks for frontend development and unit testing.

## High-Level System Architecture

```text
+-------------------------------------------------------------------+
|                   Next.js 16 + React 19 UI                        |
|                                                                   |
|  AppTitlebar | Workspace | FileExplorer | Editor | Search         |
|  CommandPalette & Keybindings | Settings | Themes | Terminal      |
+---------------------------------+---------------------------------+
                                  |
         +------------------------+------------------------+
         |                                                 |
         v                                                 v
  Frontend Services & Event Bus                    Tauri IPC / Events
  - lib/events.ts (ideEvents)                      - lib/tauri-ipc.ts
  - features/*/store.tsx                           - TerminalIpcService
  - BufferSyncService + DiffService                - Menu / Drag-Drop
         |                                                 |
         +------------------------+------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                      Tauri v2 / Rust Core                         |
|                                                                   |
|  WorkspaceGuard + SensitivePathPolicy (src-tauri/src/security/)   |
|  Sandboxed FS & Search Commands (src-tauri/src/commands/)         |
|  PTY TerminalManager & Shell Validator (src-tauri/src/terminal/)  |
|  Custom asset:// Range Protocol + Native Menu (lib.rs, menu.rs)   |
+-------------------------------------------------------------------+
                                  |
                                  v
                  Host OS (macOS / Windows / Linux)
           Filesystem · ConPTY / POSIX PTY · Native Dialogs
```

## Provider Hierarchy

The root providers compose in the following layers across [app/layout.tsx](../../app/layout.tsx) and [app/page.tsx](../../app/page.tsx):

1. **Root Layout (`app/layout.tsx`)**:
   - `ErrorBoundaryGuard`: Captures unhandled worker/script `ErrorEvent` rejections so worker failures do not crash the UI overlay.
   - `AuthProvider`: Resolves Supabase authentication state or falls back seamlessly to local offline mode (`kairo:auth:offline_mode` / missing env configuration).
   - Synchronous pre-paint script (`public/theme-init.js`): Applies the saved theme class (`dark`/`light`) before hydration to prevent flash of unstyled content.
2. **IDE Workspace Shell (`app/page.tsx` -> `IDEContent`)**:
   - `AuthGuard` -> `SettingsProvider` -> `WorkspaceProvider` -> `FileExplorerProvider` -> `EditorProvider` -> `SearchProvider` -> `IconThemeProvider` -> `TerminalProvider` -> `SidebarProvider` -> `CommandProvider`.

## Cross-Module Communication

Kairo IDE decouples subsystems with a typed singleton event bus ([`lib/events.ts`](../../lib/events.ts)):

- **Workspace events**: `workspace:opened`, `workspace:closing`, `workspace:closed`, `workspace:changed`, `workspace:switched`
- **File Explorer & FS events**: `file:selected`, `file:open-requested`, `file:open-to-side`, `file:created`, `file:renamed`, `file:deleted`, `files:deleted`, `file:moved`, `file:copied`, `file:content-changed`, `explorer:refreshed`, `explorer:collapse-all`, `explorer:multi-selected`, `explorer:focus`, `explorer:focus-filter`, `watcher:fs-changed`
- **Editor & Search events**: `editor:document-opened`, `editor:document-closed`, `editor:document-saved`, `editor:document-changed`, `editor:buffer-conflict`, `editor:active-changed`, `editor:reveal-in-explorer`, `editor:zoom-in`, `editor:zoom-out`, `editor:zoom-reset`, `editor:find`, `editor:replace`, `search:navigate-to-match`
- **Workbench & Terminal events**: `sidebar:switch-tab`, `workbench:open-file`, `terminal:toggle`, `terminal:new`, `terminal:close`, `terminal:focus`, `terminal:focus-next`, `terminal:focus-previous`, `terminal:split`, `terminal:maximize`, `terminal:clear`, `terminal:find`

## Security Architecture (Defense-in-Depth)

### 1. Native Workspace Boundary (`WorkspaceGuard`)
All native filesystem operations pass through [`src-tauri/src/security/workspace_guard.rs`](../../src-tauri/src/security/workspace_guard.rs):
- Maintains authorized workspace roots, single-file grants (from native Open/Save-As dialogs), and a monotonic workspace `generation` counter in Rust memory.
- Rejects relative paths, parent traversal (`..`), UNC/device paths, symlinks, Windows NTFS junctions, and case-insensitive prefix collisions.
- Revalidates paths against the active workspace `generation` so stale async operations abort cleanly when switching or closing workspaces.

### 2. Sensitive Path Protection (`SensitivePathPolicy`)
Defined in [`src-tauri/src/security/sensitive.rs`](../../src-tauri/src/security/sensitive.rs), blocking IDE FS read/write/copy/delete access to:
- `.env` and `.env.*` files
- `.git/` internal metadata and `secrets/` directories
- Credential stores (`.ssh`, `.gnupg`, `.aws`, `.kube`, `.docker`, `.azure`, `.gcloud`)
- Private keys (`id_rsa*`, `id_dsa*`, `id_ecdsa*`, `id_ed25519*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`) and service credential files (`credentials.json`, `secrets.*`, `.npmrc`, `.netrc`, `kubeconfig`, etc.)

### 3. Terminal Launch & Environment Sandboxing
Defined in [`src-tauri/src/terminal/shells.rs`](../../src-tauri/src/terminal/shells.rs) and mirrored in frontend validation ([`features/terminal/services/terminal-profile.service.ts`](../../features/terminal/services/terminal-profile.service.ts)):
- Rejects raw `executable` overrides on `terminal_create`; sessions must launch a discovered profile or a validated profile registered via `terminal_sync_custom_profiles`.
- Restricts executables to allowlisted interactive shells (`pwsh`, `powershell`, `cmd`, `bash`, `sh`, `zsh`, `fish`, `dash`, `nu`, `nushell`, `elvish`, `xonsh`, `wsl`, `ubuntu`, `debian`, `kali`).
- Blocks non-interactive script execution flags (`-c`, `-e`, `/c`, `-Command`, `-EncodedCommand`, etc.) and dangerous environment overrides (`PATH`, `COMSPEC`, `SHELL`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `NODE_OPTIONS`, `PYTHONPATH`, `RUSTC_WRAPPER`, etc.).

### 4. Custom `asset://` Protocol & Strict CSP
- `src-tauri/tauri.conf.json` leaves Tauri's declarative asset scope empty (`scope: []`) and enforces a strict CSP (`default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none';`).
- [`src-tauri/src/security/asset_protocol.rs`](../../src-tauri/src/security/asset_protocol.rs) serves binary media/image previews via HTTP range chunking (`1 MB` chunks, `32 MB` direct limit) only after validating through `WorkspaceGuard`.

## Dual Runtime Mode (Desktop vs Browser Fallback)

`isTauriEnvironment()` in [`lib/tauri-ipc.ts`](../../lib/tauri-ipc.ts) checks for `window.__TAURI_INTERNALS__` or `window.__TAURI__`:
- **Tauri Desktop**: Routes workspace, filesystem, search, file dialogs, native menus, drag-drop, external URL opening, and PTY terminal commands to Rust via `@tauri-apps/api`.
- **Browser Mode**: Allows UI development (`npm run dev`) and Vitest suites without Rust/Tauri by returning safe empty/mock fallbacks for native commands and echo behavior in `TerminalIpcService`.

## Related Documentation

- [Project Structure](project-structure.md)
- [Development Setup](../development/setup.md)
- [Feature Documentation Overview](../README.md)
