# Integrated Terminal (`features/terminal`)

## Feature Overview
Provides a persistent, multi-tab, split-pane integrated terminal powered by **xterm.js** in the frontend and real OS PTY sessions managed by **portable-pty** in the Rust Tauri backend.

## Implementation Location
- **Frontend Feature Module**: [`features/terminal/`](../../../features/terminal/)
  - `store.tsx` (`TerminalProvider`, `useTerminal`, `useTerminalOptional`)
  - `types.ts` (`ShellProfile`, `TerminalSessionInfo`, `TerminalCreateConfig`, `TerminalSessionState`, `TerminalSettings`)
  - `index.ts` (public exports)
  - `hooks/use-xterm.ts` (`useXterm`)
  - `services/`:
    - `terminal-ipc.service.ts` (`TerminalIpcService` — Tauri invoke/event wrappers + browser fallback)
    - `terminal-instance-registry.ts` (`TerminalInstanceRegistry` — xterm lifecycle, addons, keybinding interception, IPC listeners)
    - `terminal-profile.service.ts` (`TerminalProfileService` — profile validation, default shell persistence, custom profile storage)
    - `terminal-theme.service.ts` (`TerminalThemeService` — maps Kairo IDE themes to xterm `ITheme` ANSI palettes)
    - `terminal-link-provider.ts` (`TerminalLinkProvider` — clickable workspace `file:line:col` and `localhost:port` links)
    - `dev-server-detector.ts` (`DevServerDetector` — parses terminal output for `localhost`/`127.0.0.1` server URLs)
    - `terminal-commands.ts` (`registerTerminalCommands` — CommandRegistry bindings)
    - `terminal-toggle.ts` (`performTerminalToggle`)
  - `components/`: `terminal-panel.tsx`, `terminal-panel-header.tsx`, `terminal-panel-resizer.tsx`, `terminal-split-layout.tsx`, `terminal-view.tsx`, `terminal-view-inner.tsx`, `terminal-tabs.tsx`, `terminal-session-sidebar.tsx`, `terminal-shell-dropdown.tsx`, `terminal-find-widget.tsx`, `terminal-context-menu.tsx`, `shell-icon.tsx`
  - Unit tests: `terminal.test.ts`, `services/terminal-ipc.service.test.ts`, `services/terminal-theme.service.test.ts`
- **Rust Backend**: [`src-tauri/src/terminal/`](../../../src-tauri/src/terminal/)
  - `mod.rs`, `types.rs`, `error.rs`, `shells.rs`, `session.rs`, `manager.rs`, `commands.rs`, `tests.rs`

## Architecture
```text
TerminalPanel / TerminalSplitLayout / TerminalView
   └─ useXterm -> TerminalInstanceRegistry (xterm.js + addons + ILinkProvider)
                     ├─ keystrokes (term.onData) ──> TerminalIpcService ──> Tauri terminal_write
                     ├─ resize (ResizeObserver) ──> TerminalIpcService ──> Tauri terminal_resize
                     └─ Tauri events (terminal:data:<id>, terminal:exit:<id>) <── PTY reader thread

Rust TerminalManager (src-tauri/src/terminal/manager.rs)
   ├─ validates shell executable, args, env, cwd (shells.rs + WorkspaceGuard)
   ├─ spawns ConPTY / POSIX PTY child via portable-pty (session.rs)
   └─ emits terminal:data:<sessionId> and terminal:exit:<sessionId> events
```

- **State Preservation on Toggle**: Hiding the terminal panel unmounts layout chrome while keeping `TerminalInstance` (scrollback, xterm instance) and backend PTY processes alive across panel toggles.
- **Workspace Integration**: Opening/closing/switching workspaces updates `TerminalManager`'s default working directory (`workspace_open`/`workspace_close`) and cleans up workspace sessions (`terminal_kill_workspace`).
- **Keybinding Priority**: `TerminalInstanceRegistry` attaches `attachCustomKeyEventHandler` on xterm so workbench shortcuts registered in `KeybindingService` (e.g., `Ctrl+P`, `Ctrl+Shift+P`, `Ctrl+B`, `Ctrl+` `, `Ctrl+F`, `Ctrl+K`, `Ctrl+Shift+5`) are intercepted cleanly with `terminalFocus: true` rather than swallowed as raw PTY control characters.

## Feature Functionality
- **Terminal Creation & Lifecycle**: Auto-spawns a default shell on panel open when no active session exists; supports creating additional sessions with specific profiles (`TerminalShellDropdown`), tracking running/exited status (`Exit Code`), and immediately terminating single, workspace, or all sessions (`killTerminal`, `killWorkspaceTerminals`, `killAllTerminals`) without modal interruption.
- **High-Throughput Output Batching**: `TerminalInstanceRegistry` batches incoming PTY stdout chunks per animation frame (`requestAnimationFrame`) before writing to xterm.js, keeping scrolling and rendering smooth during heavy build or install output.
- **Tabs & Split Panes**: Switch tabs (`TerminalTabs` / `TerminalSessionSidebar`), inline rename sessions, split horizontally or vertically (`splitTerminal`, draggable ratio), and resize or maximize (`Alt+F11`) the bottom panel (`min 120px`, persisted height).
- **Shell Detection & Custom Profiles**:
  - Windows: detects PowerShell 7 (`pwsh.exe`), Windows PowerShell (`powershell.exe`), Command Prompt (`cmd.exe`), Git Bash, WSL distributions
  - macOS / Linux: detects `zsh`, `bash`, `fish`, `sh`, `nu`, `dash`, etc.
  - Custom profiles stored locally and synced/validated in Rust via `terminal_sync_custom_profiles` (up to 32 profiles).
- **xterm.js Addons & UX**:
  - `FitAddon` + `ResizeObserver` (`30ms` debounce) synchronizing kernel PTY `cols`/`rows`
  - `SearchAddon` powering `TerminalFindWidget` (`Ctrl+F` while focused, case/whole-word/regex toggles)
  - `WebLinksAddon` + custom `TerminalLinkProvider` (opens HTTP/HTTPS URLs safely via `app_open_url` and jumps `file:line:col` links in the editor)
  - `Unicode11Addon` + optional `WebglAddon` (graceful canvas fallback when WebGL is unavailable)
  - `DevServerDetector` scanning PTY output for local dev server URLs
  - Copy-on-select, right-click behavior (`contextMenu`, `paste`, `selectWord`), and themed ANSI 16-color palettes via `TerminalThemeService`.

## Dependencies
- Frontend: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/addon-unicode11`, `@xterm/addon-webgl`
- Backend: `portable-pty`, `uuid`, `which`, `serde`, `tauri`

## Configuration & Security
### Settings (`features/settings/registry.ts`)
`terminal.fontSize`, `terminal.fontFamily`, `terminal.fontWeight`, `terminal.lineHeight`, `terminal.cursorStyle`, `terminal.cursorBlink`, `terminal.scrollback`, `terminal.defaultProfile`, `terminal.defaultCwd`, `terminal.copyOnSelect`, `terminal.rightClickBehavior`, `terminal.persistAcrossWorkspaces`, `terminal.customProfiles`.

### Registered Commands & Default Keybindings
- `workbench.action.terminal.toggleTerminal` (``Ctrl+` `` / ``Cmd+` ``)
- `workbench.action.terminal.new` (``Ctrl+Shift+` `` / ``Cmd+Shift+` ``)
- `workbench.action.terminal.split` (`Ctrl+Shift+5` / `Cmd+Shift+5`)
- `workbench.action.terminal.close` (`Ctrl+Shift+W` / `Cmd+Shift+W`)
- `workbench.action.terminal.focus` (`Ctrl+Alt+T` / `Cmd+Alt+T`)
- `workbench.action.terminal.focusNext` (`Ctrl+PageDown` / `Cmd+PageDown`)
- `workbench.action.terminal.focusPrevious` (`Ctrl+PageUp` / `Cmd+PageUp`)
- `workbench.action.terminal.toggleMaximize` (`Alt+F11`)
- `workbench.action.terminal.clear` (`Ctrl+K` / `Cmd+K`, `when: terminalFocus`)
- `workbench.action.terminal.find` (`Ctrl+F` / `Cmd+F`, `when: terminalFocus`)

### Rust Security Controls
- `terminal_create` rejects raw `executable` overrides; shells must match allowlisted interactive shell names (`pwsh`, `powershell`, `cmd`, `bash`, `sh`, `zsh`, `fish`, `dash`, `nu`, `nushell`, `elvish`, `xonsh`, `wsl`, `ubuntu`, `debian`, `kali`).
- Rejects non-interactive script flags (`-c`, `-e`, `/c`, `-Command`, `-EncodedCommand`, shell chaining tokens `&&`/`||`/`;`/`|`).
- Strips/blocks sensitive environment variable overrides (`PATH`, `PATHEXT`, `COMSPEC`, `SHELL`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `NODE_OPTIONS`, `PYTHONPATH`, `RUSTC_WRAPPER`, etc.).
- Validates working directories (`cwd`) through `WorkspaceGuard` boundaries.

## User Workflow
1. Press ``Ctrl+` `` (or click the Terminal button in the title bar) to toggle the terminal panel.
2. Use the `+` dropdown to spawn a specific detected shell or custom profile, or split panes side by side (`Ctrl+Shift+5`).
3. Click highlighted `file:line:col` stack traces or `http://localhost:<port>` output directly inside the terminal.

## Development Notes
- Keep `ALLOWED_SHELL_STEMS` and `BLOCKED_ENV_VARS` aligned between [`features/terminal/services/terminal-profile.service.ts`](../../../features/terminal/services/terminal-profile.service.ts) and [`src-tauri/src/terminal/shells.rs`](../../../src-tauri/src/terminal/shells.rs).
- Ensure Tauri cleanup on app exit calls `kill_all()` (wired via window close handler in `src-tauri/src/lib.rs`).

## Known Limitations
- Running outside Tauri (`npm run dev` in a standard browser) uses `TerminalIpcService`'s `"Browser Mock Shell"` echo fallback rather than an OS PTY process.
- Right-click context menu actions and clipboard paste operate inside browser/WebView clipboard permissions.

## Related Documentation
- [Architecture Overview](../../architecture/architecture-overview.md)
- [Commands & Keybindings](../commands/README.md)
- [Settings Feature](../settings/README.md)
- [Themes Feature](../theme/README.md)
