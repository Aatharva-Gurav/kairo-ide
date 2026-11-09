# Kairo IDE – Terminal Subsystem Architecture

## 1. System Overview

The Kairo IDE Integrated Terminal provides a high-performance, developer-grade terminal emulator natively integrated into the Kairo desktop application. It combines:
- **Frontend Presentation Layer**: Built with `@xterm/xterm` (v5+), WebGL acceleration, and modern React 19 UI components styled to match Kairo's dark/light design system.
- **IPC & Transport Layer**: Asynchronous Tauri v2 inter-process communication using streaming event channels (`terminal:data:{id}`, `terminal:exit:{id}`).
- **Native Host Backend (Rust)**: PTY allocation via `portable-pty`, thread-safe session concurrency via `Arc<Mutex<...>>` and `RwLock`, and cross-platform process tree lifecycle management.
- **Controlled AI Execution Sandbox**: Completely decoupled execution runner (`AiCommandExecutor`) providing non-interactive child process execution with default-deny user approval gates, output bounding, and credential redaction for future AI coding agent integrations.

---

## 2. High-Level Architecture Diagram

```mermaid
graph TB
    subgraph UI_Layer ["Frontend UI Layer (React 19 / Next.js)"]
        TerminalPanel["TerminalPanel (Bottom Dock, Resizer, Tabs)"]
        Sidebar["TerminalSessionSidebar (Vertical Session Switcher)"]
        SplitLayout["TerminalSplitLayout (Horizontal / Vertical Split Panes)"]
        InnerView["TerminalViewInner + useXterm Hook"]
        XtermCore["xterm.js Engine (Fit, Search, WebLinks, Unicode11, WebGL)"]
        LinkProvider["TerminalLinkProvider (Clickable Files -> Monaco Nav)"]
        DevScanner["DevServerDetector (Localhost Port Scanner)"]
    end

    subgraph Service_Layer ["Frontend State & Service Layer"]
        TermStore["TerminalContext (Store & State Machine)"]
        TermRegistry["TerminalInstanceRegistry (DOM & Addon Manager)"]
        ProfileService["TerminalProfileService (Profiles & Validation)"]
        IPCService["TerminalIpcService (Tauri Command Invoker)"]
        EventBus["IDEEventBus (search:navigate-to-match, layout:toggle)"]
        AiAdapter["AiTerminalExecutionAdapter (Security & Approvals)"]
    end

    subgraph Tauri_Bridge ["Tauri IPC Boundary"]
        CmdChannel["Tauri Commands (invoke: terminal_*, ai_terminal_*)"]
        EventChannel["Tauri Event Stream (emit: terminal:data:*, terminal:exit:*)"]
    end

    subgraph Rust_Engine ["Native Host Engine (Rust / Tauri v2)"]
        TermMgr["TerminalManager (Thread-Safe Interactive Registry)"]
        PTYSession["TerminalSession (portable-pty Master/Slave Pair)"]
        ReaderThread["PTY Continuous Reader Thread Pool"]
        ShellDiscovery["Shell Detector (Windows / macOS / Linux)"]
        AiExecutor["AiCommandExecutor (Non-Interactive Sandboxed Processes)"]
        ProcessTracker["Background Process Tracker (PID, Buffers, Status)"]
    end

    subgraph OS_Kernel ["Operating System Kernel"]
        ConPTY["ConPTY (Windows) / OpenPTY (Unix / macOS / Linux)"]
        ShellProcess["Host Shell (pwsh, cmd, bash, zsh, fish)"]
        AiChildProcess["Non-Interactive Piped Child Process"]
    end

    TerminalPanel --> InnerView
    InnerView --> XtermCore
    InnerView --> TermRegistry
    XtermCore --> LinkProvider
    XtermCore --> DevScanner
    LinkProvider --> EventBus
    TerminalPanel --> Sidebar
    TerminalPanel --> SplitLayout

    TermStore --> IPCService
    TermStore --> ProfileService
    TermRegistry --> IPCService

    IPCService --> CmdChannel
    CmdChannel --> TermMgr
    CmdChannel --> ShellDiscovery
    CmdChannel --> AiExecutor

    TermMgr --> PTYSession
    PTYSession --> ReaderThread
    PTYSession --> ConPTY
    ConPTY --> ShellProcess

    ReaderThread --> EventChannel
    EventChannel --> TermRegistry

    AiAdapter --> CmdChannel
    AiExecutor --> ProcessTracker
    AiExecutor --> AiChildProcess
```

---

## 3. Structural Layer Separation

### 3.1 Presentation Layer (`features/terminal/components/`)
- **`terminal-panel.tsx`**: Host container residing at the bottom of the Kairo workspace. Maintains persistent height in `localStorage`, supports minimize, maximize, and smooth drag-resizing.
- **`terminal-panel-header.tsx`**: Header bar displaying panel title, session counter, search toggle, split action buttons, shell profile switcher, maximize toggle, and close control.
- **`terminal-session-sidebar.tsx`**: Vertical session switcher inspired by modern developer IDEs. Automatically appears when multiple sessions exist (`sessions.length > 1`) and hides on single-session configurations to preserve horizontal real estate.
- **`terminal-split-layout.tsx`**: Dynamic split-pane container supporting horizontal and vertical pane division with synchronized drag-resizing.
- **`terminal-view-inner.tsx`**: Container element mounting the underlying `xterm.js` canvas/DOM element. Attaches a debounced `ResizeObserver` to trigger fit calculations.
- **`terminal-find-widget.tsx`**: Non-intrusive floating search widget supporting next/previous match navigation, case-sensitivity toggles, and instant visual highlighting.

### 3.2 State & Registry Management (`features/terminal/services/`)
- **`terminal-instance-registry.ts`**: Static registry maintaining active `TerminalInstance` records (including `Terminal`, `FitAddon`, `SearchAddon`, `WebLinksAddon`, `Unicode11Addon`, and `WebglAddon`). Decouples high-volume terminal output from React render cycles: output chunks stream directly into xterm via listeners, entirely bypassing React reconciliation.
- **`terminal-profile.service.ts`**: Pure service that manages user-defined custom profiles, validates shell executables and arguments, and merges system-discovered shells with user overrides.
- **`terminal-theme.service.ts`**: Translates Kairo IDE theme tokens (from all 14 built-in light and dark themes) into xterm-compatible color palettes (`ITheme`).
- **`terminal-link-provider.ts`**: Regex-based link provider scanning buffer lines for file paths with optional line and column specifiers (`file.ts:42:10`). Clicks dispatch `search:navigate-to-match` across `IDEEventBus` to activate Monaco editor tabs.
- **`dev-server-detector.ts`**: Output inspector detecting `localhost` and `127.0.0.1` development server URLs, notifying subscribers to surface browser launcher actions.

### 3.3 Native Rust Backend (`src-tauri/src/terminal/`)
- **`manager.rs` (`TerminalManager`)**: Thread-safe registry (`Arc<RwLock<HashMap<String, Arc<TerminalSession>>>>`) orchestrating active PTY sessions, workspace root directory propagation, and bulk teardown.
- **`session.rs` (`TerminalSession`)**: Manages individual PTY master/slave pairs via `portable-pty`. Spawns a dedicated OS thread per session to continuously read from the master PTY and emit data events to the frontend. Implements graceful two-stage termination (Ctrl+C interrupt signal followed by process tree termination).
- **`shells.rs`**: Cross-platform shell discovery detecting PowerShell 7, Windows PowerShell, CMD, Git Bash, and WSL on Windows; zsh, bash, and Homebrew shells on macOS; and bash, zsh, fish, and sh on Linux. Includes system `PATH` resolution in `validate_executable`.
- **`ai_executor.rs` (`AiCommandExecutor`)**: Dedicated non-interactive command execution engine executing piped child processes with timeout enforcement, output byte bounds (1 MB default), cancellation tokens, and full process tree cleanup (`stop_all`). Completely isolated from interactive PTY sessions.

---

## 4. Concurrency Model & Data Flow

```mermaid
sequenceDiagram
    participant User as Developer / UI
    participant Term as xterm.js
    participant IPC as Tauri IPC Bridge
    participant PTY as Rust PTY Master
    participant Shell as Native Shell (ConPTY / OpenPTY)
    participant Reader as Rust Background Reader Thread

    User->>Term: Keystroke / Paste Input
    Term->>IPC: invoke("terminal_write", { sessionId, data })
    IPC->>PTY: writer.write_all(data) & flush()
    PTY->>Shell: Stdin transmission

    Shell->>PTY: Stdout / Stderr data stream
    PTY->>Reader: reader.read(&mut buffer)
    Reader->>IPC: emit("terminal:data:{id}", utf8_text)
    IPC->>Term: term.write(chunk)
    Term->>User: Visual render (WebGL accelerated)
```

### 4.1 Thread Allocation
1. **Main UI Thread**: Handles React UI rendering, event dispatching, and xterm layout calculations.
2. **Tauri IPC Worker Pool**: Handles incoming Tauri command invocations asynchronously without blocking the UI.
3. **Dedicated Reader Thread per Session**: Each active `TerminalSession` maintains a dedicated OS thread reading chunks up to 4096 bytes from the master PTY. When the PTY closes (EOF or process termination), the thread retrieves the process exit code, updates session state to `Exited`, emits `terminal:exit:{id}`, and terminates cleanly.

---

## 5. Session Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Initializing: terminal_create(config)
    Initializing --> Running: PTY pair opened & child spawned
    Initializing --> Failed: Shell not found / Invalid cwd

    Running --> Running: terminal_write / terminal_resize
    Running --> Terminating: terminal_kill / window close / kill_all
    Running --> Exited: Shell process exits naturally (exit / logout)

    Terminating --> Exited: SIGINT -> Process tree kill (taskkill / kill)
    Exited --> CleanedUp: TerminalInstanceRegistry.dispose(id)
    Failed --> [*]
    CleanedUp --> [*]
```
