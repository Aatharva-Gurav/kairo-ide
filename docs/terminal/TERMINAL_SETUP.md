# Kairo IDE – Terminal Setup & Developer Guide

## 1. Prerequisites

To develop, verify, and run the Kairo IDE terminal subsystem locally, ensure your workstation meets the following requirements:

### 1.1 Node.js Environment
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **TypeScript**: `v5.x`

### 1.2 Rust & Tauri Toolchain
- **Rust Compiler**: `rustc` 1.80+ (stable toolchain)
- **Cargo**: Corresponding Cargo package manager
- **Tauri CLI**: `@tauri-apps/cli` (v2.x)

### 1.3 Platform-Specific Build Tools
- **Windows**:
  - Microsoft Visual Studio C++ Build Tools (with Windows 10/11 SDK).
  - ConPTY support (Windows 10 version 1809+ / Windows 11 natively supported).
  - Optional shells: PowerShell 7 (`pwsh`), Git for Windows (`bash.exe`), WSL2 (`wsl.exe`).
- **macOS**:
  - Xcode Command Line Tools (`xcode-select --install`).
  - Native zsh (`/bin/zsh`), bash (`/bin/bash`), or Homebrew shells (`/opt/homebrew/bin/zsh`).
- **Linux (Debian/Ubuntu)**:
  - `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.

---

## 2. Project Configuration

### 2.1 Tauri Configuration (`src-tauri/tauri.conf.json`)
The application window is configured with decorations disabled (frameless window) and min dimensions `800x600`:
```json
{
  "build": {
    "frontendDist": "../out",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Kairo IDE",
        "width": 1280,
        "height": 820,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "decorations": false
      }
    ]
  }
}
```

> [!WARNING]
> **Developer Build Notice**:
> Do **NOT** run `npm run build` during normal feature development or unit testing unless explicitly preparing a production distribution. Running `npm run build` initiates Next.js static asset export and generation which requires full external build targets. Always use development mode (`npm run dev`) or test scripts for local validation.

---

## 3. IPC Interface Contracts

The terminal subsystem communicates with the Rust backend via the following Tauri IPC commands and event channels:

### 3.1 Tauri Commands
| Command Name | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `terminal_detect_shells` | *(none)* | `ShellProfile[]` | Discovers available shells on host system |
| `terminal_create` | `{ config: TerminalCreateConfig }` | `TerminalSessionInfo` | Spawns a new native PTY session |
| `terminal_write` | `{ sessionId: string, data: string }` | `void` | Writes raw data/keystrokes to master PTY |
| `terminal_resize` | `{ sessionId: string, cols: number, rows: number }` | `void` | Resizes physical dimensions of PTY |
| `terminal_kill` | `{ sessionId: string }` | `void` | Gracefully terminates session process tree |
| `terminal_list_sessions` | *(none)* | `TerminalSessionInfo[]` | Returns all active interactive sessions |
| `terminal_get_session` | `{ sessionId: string }` | `TerminalSessionInfo` | Retrieves metadata for a specific session |

### 3.2 Controlled AI Execution Commands
| Command Name | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `ai_terminal_run_command` | `{ command: string, cwd?: string, timeoutMs?: number, maxOutputBytes?: number }` | `AiCommandResult` | Synchronously executes sandboxed command |
| `ai_terminal_run_background` | `{ command: string, cwd?: string, maxOutputBytes?: number }` | `AiBackgroundProcess` | Spawns tracked background command |
| `ai_terminal_get_output` | `{ executionId: string }` | `AiProcessOutput` | Retrieves accumulated stdout/stderr buffers |
| `ai_terminal_list_processes` | `{ onlyActive?: boolean }` | `AiBackgroundProcess[]` | Lists all tracked non-interactive processes |
| `ai_terminal_stop_process` | `{ executionId: string }` | `void` | Terminates non-interactive process tree |

### 3.3 Event Streaming Channels
| Event Channel | Payload | Description |
| :--- | :--- | :--- |
| `terminal:data:{sessionId}` | `string` (UTF-8 chunk) | Continuous stdout stream from PTY reader thread |
| `terminal:exit:{sessionId}` | `{ sessionId: string, code: number \| null }` | Emitted when shell process exits |

---

## 4. Verification & Quality Commands

Always use the following sanctioned verification commands during development:

### 4.1 TypeScript Strict Compilation Check
```powershell
npx tsc --noEmit
```
*Ensures complete type safety with zero type errors (`TS2304`, `TS2322`, etc.).*

### 4.2 ESLint Validation
```powershell
npm run lint
```
*Validates compliance with Next.js and TypeScript linting rules (must exit with 0 errors, 0 warnings).*

### 4.3 Rust Compiler Check
```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```
*Verifies clean compilation of all Rust modules, dependencies, and Tauri commands.*

### 4.4 Rust Clippy Audit
```powershell
cargo clippy --manifest-path src-tauri/Cargo.toml
```
*Audits Rust source code for idiomatic patterns, memory efficiency, and linting standards.*

---

## 5. IDE Settings Configuration

Terminal preferences are integrated into Kairo IDE settings (`IDESettings.terminal`) under `features/settings/types.ts`:

```typescript
export interface TerminalSettings {
  fontSize: number;          // Default: 13 (Range: 9 - 32)
  fontFamily: string;        // Default: 'Fira Code', 'Cascadia Code', monospace
  fontWeight: string;        // Default: 'normal' ('normal' | '500' | '600' | 'bold')
  lineHeight: number;        // Default: 1.2 (Range: 1.0 - 2.5)
  cursorStyle: "block" | "underline" | "bar"; // Default: 'block'
  cursorBlink: boolean;      // Default: true
  scrollback: number;        // Default: 10000 (Max: 100000)
  copyOnSelect: boolean;     // Default: false
  rightClickBehavior: "contextMenu" | "paste" | "selectWord"; // Default: 'contextMenu'
  confirmKillProcess: boolean; // Default: true
  defaultCwd?: string;       // Default: Workspace root
  defaultProfile?: string;   // Default: OS default shell
  customProfiles?: ShellProfile[]; // User-defined custom profiles
}
```
Preferences persist across sessions in the standard settings store.
