# 05 — Identified Risks, Constraints, and Architectural Recommendations

## 1. Technical Risks and Mitigations

### Risk 1: Next.js 16 Static Export vs Node.js Agent Runtime
- **Risk**: Kairo's Next.js configuration enforces `output: "export"`. Any attempt to import `@cline/core` or Node.js native modules (`fs`, `child_process`, `net`, `http`) into the React webview code will immediately break `next build`.
- **Mitigation**: Strict runtime isolation.
  - The Next.js frontend code imports **only** browser-compatible transport code, React hooks, and Zod schemas.
  - All AI agent execution, file manipulation tools, bash execution, and LLM API calls execute strictly inside the internal `sidecar/` process.
  - The frontend communicates with the sidecar strictly via the WebSocket JSON protocol over `ws://127.0.0.1:<port>/transport`.

### Risk 2: Windows Console Window Flashing (`CREATE_NO_WINDOW`)
- **Risk**: In release builds on Windows (`windows_subsystem = "windows"`), spawning a console-subsystem child process (such as `bun`, `node`, `cmd.exe`, `git`, or a compiled CLI) without special flags causes Windows to allocate a new visible black console window for every spawn.
- **Mitigation**: In Tauri's Rust process spawner (`src-tauri/src/main.rs`), all `std::process::Command` invocations on Windows must specify:
  ```rust
  #[cfg(windows)]
  {
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x0800_0000;
      command.creation_flags(CREATE_NO_WINDOW);
  }
  ```

### Risk 3: Port Collisions & Windows Firewall Prompts
- **Risk**: Hardcoding a static port (e.g. 3126) leads to `EADDRINUSE` errors if another instance of Kairo, Cline, or another application occupies that port. Binding to `0.0.0.0` or wildcard interfaces triggers intrusive Windows Defender Firewall alerts.
- **Mitigation**:
  - The sidecar binds strictly to `127.0.0.1` (loopback only), which bypasses Windows Defender Firewall network access dialogs.
  - The sidecar attempts preferred port 3126, and falls back to port `0` (OS kernel dynamically allocates an unused ephemeral port).
  - The allocated port is reported to Tauri via stdout (`ready` line) and fetched by the frontend via `get_desktop_backend_endpoint`.

### Risk 4: Content Security Policy (CSP) Restrictions
- **Risk**: Tauri v2 enforces strict Content Security Policy defined in `tauri.conf.json`. If `connect-src` does not permit the WebSocket connection, the browser webview will reject the connection with a CSP security violation.
- **Current Kairo CSP**:
  ```
  connect-src 'self' http://localhost:3000 ws://localhost:3000 https: wss:;
  ```
- **Mitigation**: The CSP in `src-tauri/tauri.conf.json` must be updated to permit dynamic loopback WebSocket connections:
  ```
  connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https: wss:;
  ```

### Risk 5: Orphaned Sidecar Background Processes
- **Risk**: If Kairo IDE crashes, is forcefully killed from Task Manager, or is updated, the spawned sidecar child process could remain running indefinitely in the background, locking files and wasting memory.
- **Mitigation**:
  - Rust implements `Drop` and `stop()` on `DesktopBackendState` to terminate the child on application exit.
  - The sidecar monitors parent process liveness (e.g. heartbeat over WebSocket or checking parent PID) and gracefully self-terminates if the parent process vanishes.

### Risk 6: Windows Path Separators and Encoding
- **Risk**: Node.js and Bun on Windows often produce mixed path separators (e.g. `C:\Users\...` vs `C:/Users/...` or leading `/C:/`). Passing unnormalized paths into `ClineCore` or Monaco URI creates duplicate models and path mismatch errors.
- **Mitigation**: Leverage Kairo's existing, battle-tested `normalizePath()` in `lib/tauri-ipc.ts` across all frontend-to-sidecar boundary payloads.

### Risk 7: Monaco Editor Model Leaks during Agent Diffs
- **Risk**: When the AI agent proposes modifications across 20+ files in a large task, creating Monaco models for each diff without disposal will rapidly exhaust webview RAM.
- **Mitigation**: Strict adherence to Kairo's `ModelService.disposeModel()` lifecycle for all ephemeral diff models once a turn is completed or rejected.

---

## 2. Unresolved Questions & External Constraints

The following questions relate to product decisions and cannot be deduced from codebase source code alone:

1. **Packaged Runtime Distribution Strategy**:
   - For end-user distribution, should Kairo bundle a compiled Bun binary (`bun build --compile sidecar/index.ts --outfile src-tauri/bin/kairo-sidecar.exe`) so users do not need Node or Bun installed on their machines?
   - *(Recommendation: Yes. Compiling the sidecar with Bun produces a single self-contained executable placed in `src-tauri/bin/`, completely eliminating external runtime dependencies for users).*
2. **Sidecar Development Runtime**:
   - During local development (`npm run dev`), should Tauri launch the sidecar via `bun run sidecar/index.ts`?
   - *(Recommendation: Yes. Bun provides instantaneous startup and native TypeScript execution without build steps).*
3. **UI Layout Preferences**:
   - Should the AI Assistant be integrated as an additional tab in the existing `AppSidebar` (alongside `Explorer` and `Search`), or as an independent collapsible panel/dock on the right?
   - *(Recommendation: Integrate as a tab in `AppSidebar` with an optional widen/expand toggle, preserving Kairo's clean single-sidebar layout).*

---

## 3. Recommended Architecture for Implementation (Stage 02+)

### Principle 1: Internal Directory Only
- Sidecar code lives inside `sidecar/` directly at the repository root.
- No separate Vite project.
- No standalone application.
- No independent git repository.
- No separate package manager.

### Principle 2: Zero Workspace Dependencies
- Root `package.json` installs standard packages.
- The sidecar utilizes published `@cline/sdk` (`^0.2.0`) and `@cline/core` (`^0.2.0`).
- No `workspace:*` dependencies.

### Principle 3: Clean Separation of Responsibilities
1. **`src-tauri/`**:
   - Spawns and supervises `sidecar/`.
   - Reads the dynamic port from stdout.
   - Provides `get_desktop_backend_endpoint` command to the webview.
   - Preserves all 25 existing filesystem and window commands untouched.
2. **`sidecar/`**:
   - Runs on Bun (dev) or compiled executable (release).
   - Manages `ClineCore`, LLM provider settings, tool execution, and session persistence in `~/.cline/data/sessions/`.
   - Pushes real-time stream events and tool approval requests over WebSocket.
3. **`features/ai-agent/` (in Next.js frontend)**:
   - Contains typed `DesktopClient` (WebSocket client).
   - Contains `useChatSession` hook and UI presentation components (chat messages, markdown, code diffs, tool approval modal).
   - Integrates with `features/workspace/` for active folder binding and `lib/events.ts` for file updates.
