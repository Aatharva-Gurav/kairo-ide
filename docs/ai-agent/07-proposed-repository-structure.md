# 07 — Proposed Repository Structure

## 1. Executive Summary

This document specifies the unified repository layout for the AI coding-agent integration inside **Kairo IDE**.

Following our architectural decision in [06-target-architecture.md](file:///c:/Users/Aatharva%20Gurav/Desktop/projects/kairo-ide/docs/ai-agent/06-target-architecture.md), Kairo IDE will maintain **a single unified repository** without monorepo package managers, without sub-packages, and without a second frontend build pipeline.

All sidecar backend logic resides in an internal root-level directory `sidecar/`, while all frontend agent UI and state projection components reside in `features/ai-agent/`. Shared types and validation contracts reside in `lib/ai-agent/`.

---

## 2. Target Directory Tree

```
kairo-ide/
├── .github/
│   └── workflows/              # Existing CI/CD workflows
├── app/                        # Next.js App Router (Existing)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Main IDE workbench (mounts AIAgentPanel)
├── components/                 # Shared UI components (shadcn/radix) (Existing)
│   └── ui/                     # buttons, dialogs, dropdowns, inputs, scroll-area...
├── docs/                       # Architecture and design specifications
│   └── ai-agent/
│       ├── 01-kairo-repository-audit.md
│       ├── 02-cline-desktop-reference-analysis.md
│       ├── 03-runtime-and-dependency-compatibility.md
│       ├── 04-existing-feature-integration-map.md
│       ├── 05-identified-risks-and-constraints.md
│       ├── 06-target-architecture.md
│       ├── 07-proposed-repository-structure.md
│       ├── 08-transport-contract.md
│       ├── 09-state-ownership.md
│       ├── 10-security-design.md
│       └── 11-implementation-roadmap.md
├── features/                   # Feature-based modular architecture (Existing + New)
│   ├── auth/                   # Existing auth & offline guest mode
│   ├── chat/                   # Existing legacy chat (to be superseded by ai-agent)
│   ├── editor/                 # Existing Monaco editor & document management
│   ├── file-explorer/          # Existing workspace file tree & file watcher
│   ├── terminal/               # Existing xterm & Tauri PTY session manager
│   ├── settings/               # Existing IDE user settings
│   │
│   └── ai-agent/               # [NEW] Frontend Agent Integration Feature
│       ├── components/
│       │   ├── AIAgentPanel.tsx            # Main sidebar / tab view container
│       │   ├── ChatMessageList.tsx         # Virtualized or auto-scrolling message history
│       │   ├── ChatMessageItem.tsx         # Message renderer (Markdown, code, tool blocks)
│       │   ├── ChatInput.tsx               # Textarea with auto-resize, mention, attach
│       │   ├── ModeSelector.tsx            # Plan Mode vs Act Mode toggle
│       │   ├── ProviderSettingsDialog.tsx  # API keys, custom model config, endpoint setup
│       │   ├── ToolApprovalModal.tsx       # Interactive prompt for tool approvals (diffs/commands)
│       │   ├── SessionHistoryDrawer.tsx    # List and switch historical chat sessions
│       │   ├── TokenUsageBadge.tsx         # Token counter and context window progress bar
│       │   └── DiffReviewWidget.tsx        # File change inspection and revert control
│       ├── hooks/
│       │   ├── useAIAgentSession.ts        # Hook managing active session, stream state & send
│       │   ├── useDesktopTransport.ts      # WebSocket connection lifecycle, reconnect & RPC
│       │   ├── useToolApprovals.ts         # Hook tracking pending approvals and response dispatch
│       │   └── useAgentSettings.ts         # Local/persistent configuration for AI agent
│       ├── store/
│       │   └── aiAgentStore.ts             # Lightweight Zustand / React state projection
│       └── index.ts                        # Clean public exports for the IDE workbench
│
├── hooks/                      # Global frontend hooks (Existing)
├── lib/                        # Shared utility libraries (Existing + New)
│   ├── ai-agent/               # [NEW] Shared Client-Server Contracts
│   │   ├── transport-schema.ts # Zod schemas for commands, responses, and events
│   │   ├── types.ts            # Inferred TypeScript types from schemas
│   │   └── protocol-constants.ts # Protocol version, default ports, ping intervals
│   ├── store.ts                # Existing global state
│   ├── tauri.ts                # Existing Tauri IPC helpers
│   └── utils.ts                # Existing cn() and formatters
│
├── public/                     # Static assets (Existing)
│
├── scripts/                    # Development, build, and packaging scripts (Existing + New)
│   ├── build-sidecar.ts        # [NEW] Bun compilation script: creates standalone executable
│   └── dev-sidecar.ts          # [NEW] Bun dev runner for standalone sidecar testing
│
├── sidecar/                    # [NEW] Internal AI Coding-Agent Backend (Server-Only)
│   ├── context.ts              # Workspace context loader, repo maps, environment inspection
│   ├── index.ts                # Entry point: CLI arg parsing, token setup, server launch
│   ├── provider-manager.ts     # Provider validation, credential loading, custom base URLs
│   ├── runtime.ts              # ClineCore instance orchestration, task turns, cancellation
│   ├── server.ts               # Bun.serve HTTP + WebSocket server, request router, auth gate
│   ├── session-store.ts        # Session persistence, history listing, transcript retrieval
│   ├── tool-coordinator.ts     # Tool permission gating, approval tracking, execution dispatch
│   ├── tsconfig.json           # Isolated TypeScript config (Node/Bun runtime, no DOM)
│   └── types.ts                # Backend-specific state, options, and runtime types
│
├── src-tauri/                  # Rust Tauri v2 Application (Existing + Augmented)
│   ├── bin/                    # [NEW] Target directory for compiled sidecar binaries
│   │   └── .gitkeep
│   ├── capabilities/           # Tauri permissions (Existing)
│   │   └── default.json
│   ├── src/
│   │   ├── commands/           # Existing commands (fs.rs, workspace.rs, pty.rs)
│   │   │   └── backend.rs      # [NEW] Sidecar supervisor: spawn, status, healthcheck, shutdown
│   │   ├── state/
│   │   │   └── backend.rs      # [NEW] DesktopBackendState holding child process handle & port
│   │   ├── lib.rs              # Tauri command registry (Existing)
│   │   └── main.rs             # Tauri entry point, setup hook, exit cleanup (Existing)
│   ├── Cargo.toml              # Rust crate dependencies
│   ├── tauri.conf.json         # Tauri app configuration (externalBin bundle configuration)
│   └── ...
│
├── tests/                      # Existing frontend & integration tests (Vitest)
├── package.json                # Single root package manifest
├── package-lock.json           # Single lockfile
├── tsconfig.json               # Root TypeScript configuration (Web/Next.js)
├── next.config.ts              # Next.js build configuration (output: export)
└── README.md
```

---

## 3. Detailed Component Explanations

### 3.1. `sidecar/` — Internal Agent Backend
The `sidecar/` directory contains all server-side logic executed directly by the runtime engine (Bun). It is completely decoupled from the Next.js compilation graph and will **never** be imported into any browser file.

1. **`sidecar/index.ts`**:
   The process entry point. Parses command-line arguments:
   `--port <port>`, `--approval-token <token>`, `--workspace <dir>`.
   Initializes process signal traps (`SIGINT`, `SIGTERM`), instantiates `DesktopBackendServer`, and logs startup readiness.
2. **`sidecar/server.ts`**:
   Implements the HTTP and WebSocket endpoints using `Bun.serve()`.
   - Rejects any connection non-local to `127.0.0.1`.
   - Validates the `approval_token` on connection upgrade.
   - Manages active client sockets and dispatches incoming RPC messages.
3. **`sidecar/runtime.ts`**:
   Encapsulates `@cline/core` / `ClineCore`.
   - Initializes provider API handlers (Anthropic, OpenRouter, Bedrock, Ollama, Gemini, etc.).
   - Orchestrates multi-turn conversation and step loops.
   - Manages tool execution approval promises and token streaming.
4. **`sidecar/tool-coordinator.ts`**:
   Evaluates each tool call requested by the model against the active security profile (Plan Mode vs Act Mode).
   - Read-only tools (`read_file`, `list_directory`, `search_files`) auto-approved if configured.
   - Mutating tools (`write_to_file`, `apply_diff`, `execute_command`) hold execution and push a `tool_approval_request` event over WebSocket to the UI.
5. **`sidecar/context.ts`**:
   Provides workspace intelligence: parses `.gitignore`, gathers active workspace root, tracks open document context passed from Kairo editor.
6. **`sidecar/session-store.ts`**:
   Manages session storage on disk in the user data directory (`~/.kairo/sessions/` or platform equivalent).
   Lists previous sessions, loads historical turns, and safely truncates or deletes session records.
7. **`sidecar/tsconfig.json`**:
   Specialized TypeScript config targeting Bun/Node runtime types (`@types/bun`, `@types/node`), strict typing, and ESNext modules. Ensures VS Code / IDE provides correct server-side auto-completion.

### 3.2. `features/ai-agent/` — Next.js Frontend Integration
Follows Kairo's modular feature structure (alongside `features/editor`, `features/file-explorer`, `features/terminal`).

1. **`components/AIAgentPanel.tsx`**:
   The top-level container mounted inside the Kairo workspace sidebar. Displays session status, connection indicator, model badge, mode toggle, and message feed.
2. **`components/ChatMessageList.tsx` & `ChatMessageItem.tsx`**:
   Renders user, assistant, system, and tool messages.
   - Renders Markdown, code blocks with syntax highlighting, and collapsible tool executions.
   - Displays streaming tokens and reasoning/thinking traces in real time.
3. **`components/ToolApprovalModal.tsx` / `DiffReviewWidget.tsx`**:
   Displays pending tool approval requests with side-by-side or inline unified diffs for file edits, and exact bash/powershell strings for terminal commands.
4. **`hooks/useDesktopTransport.ts`**:
   Manages the WebSocket lifecycle to `ws://127.0.0.1:<port>/transport`.
   - Retrieves backend port and token from Tauri IPC command `get_desktop_backend_endpoint`.
   - Handles auto-reconnect with exponential backoff and message queueing.
   - Sends typed commands and routes incoming events to `aiAgentStore`.
5. **`hooks/useAIAgentSession.ts`**:
   Provides developer-facing ergonomics for sending messages, aborting tasks, switching modes, and changing active sessions.
6. **`store/aiAgentStore.ts`**:
   Lightweight client-side projection store (Zustand or React state). Stores currently rendered messages, active task status (`idle`, `busy`, `waiting_approval`), streaming buffers, and connection status.

### 3.3. `lib/ai-agent/` — Shared Contracts
Ensures total type safety across the WebSocket boundary without duplicating code.

1. **`transport-schema.ts`**:
   Zod definitions for every command (`chat_session_command`, `respond_tool_approval`, `set_mode`, etc.) and every event (`chunk`, `tool_call_start`, `task_complete`, etc.).
2. **`types.ts`**:
   Exported TypeScript types inferred directly via `z.infer<typeof ...>`.
3. **`protocol-constants.ts`**:
   Shared protocol constants (`PROTOCOL_VERSION = "1.0.0"`, default timeouts, heartbeat intervals).

### 3.4. `src-tauri/` — Rust Supervisor
1. **`src/commands/backend.rs`**:
   Implements Tauri commands:
   - `get_desktop_backend_endpoint()`: Returns `{ port: u16, approval_token: String, status: String }`.
   - `restart_desktop_backend()`: Kills existing sidecar child process and respawns it.
2. **`src/state/backend.rs`**:
   Maintains `DesktopBackendState` in Tauri managed memory:
   - Holds child process handle (`std::process::Child`).
   - Holds assigned listening port and generated random secret approval token (32-character hex).
   - Monitors process exit / crash and coordinates clean teardown on application exit.

### 3.5. `scripts/` — Build and Packaging Scripts
1. **`scripts/build-sidecar.ts`**:
   Executes `bun build sidecar/index.ts --compile --target=bun-windows-x64 --outfile src-tauri/bin/kairo-sidecar-x86_64-pc-windows-msvc.exe` (and corresponding targets for macOS and Linux).
   Invoked by Tauri before building the final installer package (`beforeBundleCommand`).
2. **`scripts/dev-sidecar.ts`**:
   Convenience script for developers to run and test the sidecar independently with hot-reloading during backend development.

---

## 4. Package Manifest and Lockfile Management

To prevent the dependency confusion and version fragmentation identified in Stage 01:

1. **Single Root `package.json`**:
   All dependencies for both frontend and sidecar are declared in the single root `package.json`.
   - Frontend deps: `next`, `react`, `react-dom`, `@monaco-editor/react`, `lucide-react`, `zustand`, `zod`.
   - Sidecar deps: `@cline/core` (or `@cline/sdk`), `@types/bun`.
2. **Single `package-lock.json`**:
   No nested `package.json` files or secondary lockfiles are created in `sidecar/`.
3. **Prevention of Bundler Leaks**:
   `next.config.ts` will strictly include application paths and ignore `sidecar/`. Since `sidecar/index.ts` is only executed by Bun, Webpack/Turbopack will never parse or bundle backend code into the client bundle.

---

## 5. Summary of Key Architectural Advantages

| Dimension | Proposed Kairo Layout | Legacy/Vite Multi-Repo Approach |
| :--- | :--- | :--- |
| **Repositories** | 1 (Unified in `kairo-ide`) | 2 (Desynchronized repos) |
| **Package Manifests** | 1 (`package.json`) | 2+ (Conflicting locks and versions) |
| **Frontend Apps** | 1 (Existing Next.js export) | 2 (Conflicting webview & main app) |
| **Sidecar Location** | `sidecar/` (Internal) | External / Nested sub-app |
| **Shared Contracts** | `lib/ai-agent/` (Direct import) | Duplicated or linked npm packages |
| **Release Artifact** | Standalone Bun `.exe` in `src-tauri/bin/` | Complex multi-stage runtime bundling |
