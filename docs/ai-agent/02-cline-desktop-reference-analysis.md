# 02 — Official Cline Desktop Reference Architecture Analysis

## 1. Upstream Reference Identification

- **Repository**: `https://github.com/cline/cline`
- **Subdirectory**: `apps/examples/desktop-app`
- **Upstream Commit SHA**: `a6507a62a147db4a35e27f4294589742ccac5060`
- **Inspection Date**: `2026-11-01`
- **Monorepo Engine**: Bun (`bun.lock`) with workspaces:
  - `apps/examples/desktop-app` (`@cline/code`)
  - `sdk/packages/core` (`@cline/core`)
  - `sdk/packages/sdk` (`@cline/sdk`)
  - `sdk/packages/shared` (`@cline/shared`)
  - `sdk/packages/llms` (`@cline/llms`)
  - `sdk/packages/agents` (`@cline/agents`)
  - `sdk/packages/ui` (`@cline/ui`)
  - `cli` (`cline`)

---

## 2. Desktop App File & Folder Inventory

The official desktop application contains 4 major directory trees:

```
apps/examples/desktop-app/
├── sidecar/                    # Standalone persistent TypeScript backend
│   ├── index.ts                # Sidecar bootloader, signal handling, process lifecycle
│   ├── server.ts               # Bun HTTP & WebSocket server, origin & approval verification
│   ├── context.ts              # SidecarContext, ClineCore lifecycle, Hub client, tool approval routing
│   ├── types.ts                # Transport & internal state types, environment IDs
│   ├── cli-runtime.ts          # Bundled CLI discovery and Hub process spawning
│   ├── chat-session.ts         # Session manager, start/attach/send/stop/queue dispatch
│   ├── paths.ts                # Resolution for ~/.cline/data, manifests, logs
│   ├── commands.ts             # Command handler router (120+ desktop & session commands)
│   ├── attachments.ts          # File & image upload tracking and cleanup
│   ├── observability.ts        # Pino file logging and OpenTelemetry forwarding
│   ├── marketplace.ts          # Plugin/MCP/skill catalog fetching
│   ├── hub-startup.ts          # Background retry & settling coordination for Hub
│   ├── session-data/           # Session persistence, discovery, messages projection
│   │   ├── messages.ts         # Message serialization & reading (<sessionId>.messages.json)
│   │   ├── discovery.ts        # Local session scanning and metadata caching
│   │   ├── agents.ts           # Sub-agent hierarchy and child session traversal
│   │   └── search.ts           # Full-text session search
│   └── local-runtimes/         # Ollama and LM Studio model detection
├── src-tauri/                  # Tauri v2 native shell
│   ├── src/
│   │   ├── main.rs             # Process manager, backend supervisor, window & updater commands
│   │   ├── terminal.rs         # Native PTY terminal integration
│   │   ├── linux_tray.rs       # Linux tray status icon handler
│   │   ├── linux_webview.rs    # Linux WebKit DMA-BUF workaround
│   │   └── macos_notification.rs
│   ├── tauri.conf.json         # Production Tauri v2 configuration
│   ├── tauri.dev.conf.json     # Development Tauri v2 configuration
│   └── Cargo.toml              # Rust crate dependencies
├── scripts/                    # Build, dev, and packaging scripts
│   ├── dev-headless.ts         # Headless dual-runner (sidecar + Next.js webview)
│   ├── build-desktop-runtime.ts# Compiles standalone CLI & bundles sidecar
│   ├── package-desktop.ts      # Multi-platform NSIS, DMG, DEB, RPM packager
│   └── telemetry-define-args.ts
└── webview/                    # Next.js 16 UI
    ├── lib/
    │   ├── desktop-client.ts   # WebSocket RPC client with automatic reconnection
    │   ├── desktop-transport.ts# Transport types (Request, Response, Event)
    │   ├── chat-schema.ts      # Zod schemas for messages, turns, config, and media
    │   └── session-diff.ts     # File modification diffing
    ├── hooks/
    │   ├── use-chat-session.ts # React hook for live streaming turns, approvals, and questions
    │   └── chat-session/       # Reducers, attachments, helpers, and types
    └── components/             # Views, chat composer, settings panels, markdown renderer
```

---

## 3. The 12 Architectural Mechanics

### 1. How Tauri starts the backend
In `src-tauri/src/main.rs`, Tauri maintains a thread-safe singleton state struct:
```rust
struct DesktopBackendState {
    ws_endpoint: Mutex<Option<String>>,
    process: Mutex<Option<Child>>,
    shutting_down: AtomicBool,
}
```
During application startup (`setup` hook in `tauri::Builder`), Tauri initializes this state. When the webview or Tauri supervisor requests the endpoint, `ensure_desktop_backend_started()` is invoked:
- It acquires an exclusive lock on `DesktopBackendState.process`.
- If an existing child is still alive (`try_wait() == Ok(None)`), it reuses it.
- If dead or unstarted, it spawns the child process via `spawn_desktop_backend_process()`.
- On Windows, it sets the creation flag `CREATE_NO_WINDOW = 0x0800_0000` so console subprocesses do not flash black terminal windows.
- It attaches background reader threads to `child.stdout` and `child.stderr`.

### 2. How the backend runtime is selected
- **In Development Mode (`cfg!(debug_assertions)`)**:
  - `spawn_desktop_backend_process` resolves the unbundled script `sidecar/index.ts`.
  - It executes `bun run sidecar/index.ts` directly, with working directory set to `context.workspace_root`.
- **In Packaged Release Builds**:
  - The script does not use system Bun or Node.
  - Instead, it looks for the bundled Cline CLI executable in `src-tauri/bin/cline-cli` (or next to the current `.exe`).
  - It resolves the bundled JavaScript backend at `src-tauri/bin/desktop-backend/index.js`.
  - It spawns:
    `cline-cli run --use-system-ca --no-env-file <bundle_path>`
    with environment variable `BUN_BE_BUN=1`.
  - Because `cline-cli` is compiled using `bun build --compile`, running it with `BUN_BE_BUN=1` instructs the compiled binary to act as the embedded Bun runtime, executing the JS bundle without requiring Bun or Node installed on the user's OS.

### 3. How the backend starts or connects to the Cline runtime/Hub
- In `sidecar/index.ts`, `setUpLocalHub()` executes `ensureHubWithDesktopCli(desktopCliPath, workspaceRoot)`.
- This calls `cline-cli hub ensure --json --discovery-path ...`, which checks whether a healthy, version-compatible Hub daemon is already running on loopback:
  - If a compatible Hub exists, it connects to it and returns the active Hub URL.
  - If no Hub is running, it starts a daemonized Hub process bound to loopback.
- The sidecar then initializes `ClineCore`:
  ```typescript
  const sessionManager = await ClineCore.create({
    clientName: "cline-code",
    backendMode: "hub",
    capabilities: createSidecarRuntimeCapabilities(ctx),
    logger: ctx.logger,
    telemetry: ctx.telemetry,
    hub: {
      strategy: "require-hub",
      workspaceRoot: ctx.localWorkspaceRoot,
      cwd: ctx.localWorkspaceRoot,
      clientType: "code-sidecar",
      displayName: "Cline Desktop sidecar",
    },
  });
  ```
- The sidecar also instantiates a `NodeHubClient` from `@cline/core/hub` to act as an observer and issue commands (`approval.respond`, `run.proceed_while_running`).

### 4. How the backend chooses its listening port
- In `sidecar/server.ts`, `startServer()` tests an array of candidate ports:
  ```typescript
  const candidates = [preferredPort, 0];
  ```
- Default `preferredPort` is `SIDECAR_PORT` (3126, or `CLINE_SIDECAR_PORT` if specified).
- If port 3126 is occupied, it falls back to port `0`, which tells the operating system kernel to allocate an ephemeral free port.
- `server.port` captures the actual bound port.
- The bind hostname is strictly `127.0.0.1` (`SIDECAR_HOST`), which avoids triggering Windows Firewall prompts.

### 5. How the WebSocket endpoint reaches the frontend
1. When the sidecar HTTP/WS server starts, it formats a readiness JSON string:
   ```typescript
   const wsEndpoint = new URL(`ws://${dialHost}:${port}/transport`);
   wsEndpoint.searchParams.set("approval_token", approvalToken);
   process.stdout.write(JSON.stringify({
     type: "ready",
     endpoint: `http://${dialHost}:${port}`,
     wsEndpoint: wsEndpoint.toString(),
     pid: process.pid,
     mode: "bun",
   }) + "\n");
   ```
2. The Tauri Rust supervisor thread reads `child.stdout`, parses the `DesktopBackendReadyLine` where `line_type == "ready"`, and stores the full `wsEndpoint` URL inside `DesktopBackendState.ws_endpoint`.
3. The frontend calls Tauri IPC command:
   ```typescript
   await invoke<string>("get_desktop_backend_endpoint")
   ```
4. Tauri returns the exact WebSocket URL (including the query token).

### 6. How the frontend authenticates and connects
- When creating the WebSocket connection in `webview/lib/desktop-client.ts`, the frontend dials `ws://127.0.0.1:<port>/transport?approval_token=<uuid>`.
- In `sidecar/server.ts`:
  1. **Origin Header Check**: Validates that `Origin` matches trusted origins (`tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`, `http://localhost:3125`).
  2. **Approval Token Check**: Uses constant-time buffer comparison (`timingSafeEqual`) to verify `approval_token`.
  3. Clients with valid token and origin are granted `canApproveTools: true` on the WebSocket socket metadata.

### 7. How commands and events are exchanged
Communication uses a structured, bidirectional JSON protocol over the single `/transport` WebSocket:
- **Client Request**:
  ```json
  { "type": "command", "id": "req-1", "command": "chat_session_command", "args": { ... } }
  ```
- **Server Response**:
  ```json
  { "type": "response", "id": "req-1", "ok": true, "result": { ... }, "error": null }
  ```
- **Server-Pushed Event**:
  ```json
  { "type": "event", "event": { "name": "chat_event", "payload": { ... } } }
  ```
- The frontend `desktopClient` tracks in-flight request IDs with promises and dispatches pushed events to registered listeners (`onEvent(name, handler)`).

### 8. How agent sessions are created and resumed
- To create a session, the frontend sends:
  ```typescript
  desktopClient.invoke("chat_session_command", {
    request: {
      action: "start",
      config: {
        workspaceRoot: "...",
        provider: "anthropic",
        model: "claude-3-7-sonnet-20250219",
        mode: "act",
        enableTools: true,
        ...
      },
      prompt: "Fix the bug in main.rs"
    }
  });
  ```
- In `sidecar/chat-session.ts`, `handleChatSessionCommand` invokes `sessionManager.create(startConfig)`.
- If an active session already exists on the Hub, the client calls `action: "attach"`, which subscribes to existing event streams.
- To resume an existing persisted session, `session.resume` on the Hub is invoked, re-hydrating messages from disk.

### 9. How tool approvals are delivered and resolved
1. When an agent attempts a sensitive tool (e.g. `execute_command`, `write_to_file`), `ClineCore` triggers the capability callback `requestToolApproval(request)`.
2. `sidecar/context.ts` receives this call, creates an unfulfilled `Promise<ToolApprovalResult>`, and finds the connected client with `canApproveTools === true`.
3. It emits an event to the webview:
   ```json
   { "type": "event", "event": { "name": "tool_approval_request", "payload": { "requestId": "appr-1", "toolName": "execute_command", ... } } }
   ```
4. The webview renders an Approval Modal / banner.
5. When the user clicks **Approve** or **Reject**, the webview invokes:
   ```typescript
   desktopClient.invoke("respond_tool_approval", { approvalId: "appr-1", approved: true });
   ```
6. The sidecar resolves the internal Promise, allowing `ClineCore` to proceed or abort the tool call.

### 10. How sessions and messages are persisted
- Sessions are stored under `~/.cline/data/sessions/<sessionId>/`.
- The canonical replay artifact is `<sessionId>.messages.json`.
- It records chronological turn messages, token usage metrics, assistant thinking/reasoning blocks, tool calls, and model metadata.
- Checkpoints and diff history are recorded in `<sessionId>/checkpoints/`.
- Discovery scanning (`sidecar/session-data/discovery.ts`) reads these directories to list previous sessions in the history view without requiring a central SQL database.

### 11. How the backend shuts down
1. When the Tauri window closes or application quits:
   - On macOS/Linux: Tauri issues a `kill(pid)` with `SIGTERM` to the child process.
   - On Windows: Tauri calls `child.kill()` (`TerminateProcess`), followed by `child.wait()`.
2. When the sidecar receives `SIGTERM` or `SIGINT`, it executes bounded shutdown:
   - Sets `shuttingDown = true`.
   - Calls `disposeSidecarContext(ctx, "shutdown")`, which cancels pending approvals, closes client sockets, flushes active log buffers, and detaches the Hub client.
   - Enforces a strict 5,000ms timeout (`SHUTDOWN_TIMEOUT_MS`) before exiting.
3. The shared Cline Hub process remains running daemonized so other CLI or desktop instances do not lose state.

### 12. How packaged builds locate and execute runtime artifacts
- In `tauri.conf.json`:
  ```json
  "externalBin": ["bin/cline-cli"],
  "resources": ["bin/desktop-backend/**/*"]
  ```
- On Windows packaging:
  - `src-tauri/bin/cline-cli.exe` is placed into the application installation root.
  - `src-tauri/bin/desktop-backend/` is copied into the application resource bundle.
- At runtime:
  - Rust uses `std::env::current_exe()` to resolve its parent directory.
  - It finds `cline-cli.exe` directly beside `kairo-ide.exe`.
  - It finds the bundled JS script in `resource_dir/bin/desktop-backend/index.js`.
  - It executes `cline-cli run ...` with `CREATE_NO_WINDOW`.

---

## 4. Development vs Packaged Runtime Comparison

| Dimension | Development Runtime | Packaged Production Runtime |
| :--- | :--- | :--- |
| **Interpreter** | Host-installed `bun` binary | Bundled `cline-cli` with embedded Bun runtime (`BUN_BE_BUN=1`) |
| **Script Format** | Raw TypeScript (`sidecar/index.ts`) | Single bundled JS file (`bin/desktop-backend/index.js`) |
| **Launch Command** | `bun run sidecar/index.ts` | `cline-cli run --use-system-ca --no-env-file <bundle_path>` |
| **Process Stdio** | Piped; stderr/stdout prefixed to developer terminal | Piped to Rust reader threads; logs written to `~/.cline/data/logs/` |
| **Port Resolution** | Defaults to `3126`, falls back to random available port | Dynamically assigns port; announces via JSON stdout line |
| **Webview Target** | Next.js Turbopack dev server (`http://localhost:3125`) | Static Next.js export served from `../webview/out` |

---

## 5. Architectural Classification of Reference Features

| Classification | Components | Can Kairo Use This? |
| :--- | :--- | :--- |
| **1. Public SDK Functionality** | `ClineCore`, `ContributionRegistry`, `createTool`, `buildClineSystemPrompt`, `NodeHubClient` (via `@cline/core/hub`), standard provider configurations. | **YES**: Available via published `@cline/sdk` and `@cline/core` npm packages. |
| **2. Internal Monorepo Functionality** | `@cline/ui` workspace package, `@cline/llms` private workspace types, monorepo cross-compilation scripts in `scripts/build-desktop-runtime.ts`. | **NO**: Must not be imported using `workspace:*`. Kairo uses its own UI system and standard npm packages. |
| **3. Desktop-Specific Functionality** | Dual-socket architecture (WebSocket command router + Hub client observer), JSON transport protocol (`DesktopTransportRequest/Response/Event`), approval routing with `approval_token`, session projection caching. | **YES**: Essential architectural pattern to replicate inside Kairo's internal `sidecar/`. |
| **4. Tauri-Specific Functionality** | `DesktopBackendState` process supervisor in Rust, `get_desktop_backend_endpoint` command, `CREATE_NO_WINDOW` process spawning flag on Windows. | **YES**: Cleanly integrates into Kairo's `src-tauri/src/main.rs` and `lib.rs`. |
| **5. Optional Capabilities** | SSH remote environments, Composio toolkits, PostHog telemetry inlining, macOS DMG background art generator, GitHub PR status row. | **DEFER**: Secondary capabilities not required for core coding-agent operations in Kairo IDE. |
