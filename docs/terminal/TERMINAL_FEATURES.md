# Kairo IDE – Terminal Features Reference

## 1. Feature Highlights

The Kairo IDE integrated terminal delivers an experience tailored for modern engineering workflows:
- **Multiple Independent Sessions**: Create and manage multiple concurrent terminal instances without process interference.
- **Adaptive Session List**: A clean vertical session list appears on the right whenever more than one session is active (`sessions.length > 1`), automatically hiding on single sessions to maximize terminal width.
- **Split Terminals**: Horizontally or vertically split the active view to monitor build tools alongside runtime servers.
- **Intelligent Link Detection**: Recognizes file paths in compiler errors or test logs and navigates directly to the line and column in Monaco Editor.
- **Local Dev Server Detection**: Inspects output for localhost addresses (`http://localhost:3000`) and provides one-click browser opening.
- **Deep Theme Harmony**: Synchronizes foreground, background, cursor, selection, and ANSI colors across all 14 Kairo dark and light themes.

---

## 2. Terminal Panel & Layout Controls

### 2.1 Docking & Sizing
- **Bottom Panel Integration**: Lives at the bottom of the workspace, dynamically adjusting the vertical space allocated to the editor area rather than covering or floating over it.
- **Drag Resizing**: Drag the top resizer border to adjust height (minimum height: `120px`). The height preference is persisted in `localStorage` (`kairo:terminal_panel_height`).
- **Maximize & Restore**: Toggle full-workspace height with the maximize button or `Alt+F11`.

### 2.2 Header Controls
- **Panel Title & Active Session Badge**: Shows active session name and running status dot (green for running, gray for exited).
- **Find in Terminal (`Ctrl+F` / `Cmd+F`)**: Opens the non-intrusive terminal search widget.
- **Split Actions**: Split horizontally (`Ctrl+Shift+5`) or vertically.
- **Shell Profile Dropdown**: Launch terminals with specific discovered or custom shell profiles.
- **Maximize / Close Controls**: Quick access to panel window states.

---

## 3. Session Navigation & Splitting

### 3.1 Adaptive Session Sidebar (`terminal-session-sidebar.tsx`)
When multiple sessions exist:
- Appears docked on the right side of the terminal panel.
- Shows individual session items with icon, custom title, status indicator, and kill button.
- Double-click allows inline renaming of session tabs.
- Supports switching sessions by clicking or via keyboard shortcuts (`Ctrl+PageDown` / `Ctrl+PageUp`).

```
+------------------------------------------------------+----------------+
|  Terminal Output Area                                | [>] bash (1)   |
|  $ npm test                                          | [>] node (2) * |
|  PASS features/terminal/terminal.test.ts             | [x] python (3) |
|                                                      |                |
+------------------------------------------------------+----------------+
```

### 3.2 Split Layout (`terminal-split-layout.tsx`)
- Supports splitting the view horizontally (side-by-side) or vertically (stacked).
- Each pane retains independent session focus, mouse events, and resize synchronization.
- Drag-resizing the splitter border smoothly redistributes the pane split ratio.

---

## 4. Shell Profiles & Custom Profiles

### 4.1 Host Shell Auto-Discovery
Kairo automatically scans the host environment on launch:
- **Windows**:
  - PowerShell 7 (`pwsh.exe`)
  - Windows PowerShell (`powershell.exe`)
  - Command Prompt (`cmd.exe`)
  - Git Bash (`bash.exe` in Git/bin or AppData)
  - Windows Subsystem for Linux (`wsl.exe`)
- **macOS**:
  - System Zsh (`/bin/zsh -l`)
  - System Bash (`/bin/bash -l`)
  - Homebrew Zsh / Bash / Fish (`/opt/homebrew/bin/*`)
- **Linux**:
  - User login shell (`$SHELL -l`)
  - Standard shells (`/usr/bin/bash`, `/usr/bin/zsh`, `/usr/bin/fish`, `/bin/sh`)

### 4.2 Custom Profile Configuration (`terminal-profile.service.ts`)
Users can configure custom profiles via settings or programmatic API:
- **Executable**: Absolute path or relative command resolved against system `PATH`.
- **Arguments**: Optional string array (e.g. `["--login", "-i"]`).
- **Environment Variables**: Key-value map injected into the spawned process.
- **Initial Working Directory**: Specific folder path or default workspace root.
- **Startup Command**: Command automatically executed upon session initialization (e.g. `source venv/bin/activate`).

---

## 5. Intelligent Link Detection & Server Detection

### 5.1 Clickable File Paths (`terminal-link-provider.ts`)
The link provider uses high-precision regular expressions to identify source code references:
- Supported patterns:
  - `src/main.rs:24:10`
  - `features/terminal/types.ts:42`
  - `components/app.tsx(15,8)`
  - `C:\work\project\lib\utils.ts:100`
- **Click Behavior**: Clicking a detected link dispatches `search:navigate-to-match` across the global `IDEEventBus`. The file is opened in Monaco Editor with the cursor positioned directly on the line and column.

### 5.2 Dev Server Port Detection (`dev-server-detector.ts`)
Inspects incoming stdout chunks for standard web server address banners:
- Detects `http://localhost:[port]`, `http://127.0.0.1:[port]`, `https://localhost:[port]`, `http://0.0.0.0:[port]`.
- Recognizes outputs from Vite, Next.js, Webpack, Rust Axum/Actix, Python FastAPI, Go Gin, etc.
- Emits notifications enabling one-click opening in the host operating system's default browser.

---

## 6. Keyboard Shortcuts Matrix

All terminal actions are registered with Kairo's central `CommandRegistry` and `KeybindingService`, supporting platform-aware modifier keys (`Cmd` on macOS, `Ctrl` on Windows/Linux):

| Action | Command ID | Windows / Linux | macOS |
| :--- | :--- | :--- | :--- |
| **Toggle Terminal Panel** | `workbench.action.terminal.toggle` | `Ctrl+\`` | `Cmd+\`` |
| **New Terminal Session** | `workbench.action.terminal.new` | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| **Close Active Session** | `workbench.action.terminal.kill` | `Ctrl+Shift+W` | `Cmd+Shift+W` |
| **Focus Terminal** | `workbench.action.terminal.focus` | `Ctrl+Alt+T` | `Cmd+Alt+T` |
| **Focus Next Session** | `workbench.action.terminal.focusNext` | `Ctrl+PageDown` | `Cmd+PageDown` |
| **Focus Previous Session** | `workbench.action.terminal.focusPrevious`| `Ctrl+PageUp` | `Cmd+PageUp` |
| **Split Terminal** | `workbench.action.terminal.split` | `Ctrl+Shift+5` | `Cmd+Shift+5` |
| **Maximize / Restore Panel** | `workbench.action.terminal.toggleMaximize`| `Alt+F11` | `Alt+F11` |
| **Clear Terminal Buffer** | `workbench.action.terminal.clear` | `Ctrl+K` | `Cmd+K` |
| **Find in Terminal** | `workbench.action.terminal.find` | `Ctrl+F` | `Cmd+F` |

---

## 7. Find Widget

The built-in find widget (`terminal-find-widget.tsx`) hooks into `@xterm/addon-search`:
- Trigger with `Ctrl+F` while the terminal has focus.
- Supports next match (`Enter`), previous match (`Shift+Enter`), match case toggle, whole word toggle, and regular expressions.
- Dismiss with `Escape` or the close icon to return focus immediately to active typing.
