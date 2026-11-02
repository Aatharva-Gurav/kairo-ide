# 11 — Implementation Roadmap & Verification Gates

## 1. Overview & Strategy

This roadmap details the sequential execution phases for implementing the native AI coding-agent in Kairo IDE.

Each stage builds incrementally upon the previous stage, contains explicit deliverables, and is guarded by a **Verification Gate**. No stage may proceed until all verification gates of the preceding stage pass completely without regressions.

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 01: Comprehensive Audit & Upstream Analysis (DONE)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 02: Final Architecture & Target Design (DONE)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 03: Workspace Scaffolding & Shared Contracts          │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 04: Internal Sidecar Backend Implementation           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 05: Rust / Tauri Supervisor & IPC Integration         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 06: Frontend Transport & Agent Workspace UI           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 07: Interactive Tool Approvals & Diff Inspection      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ STAGE 08: End-to-End Validation, Packaging & Delivery       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Phased Roadmap

### Stage 03: Workspace Scaffolding & Shared Contracts
* **Objective**: Establish the internal directory structure and declare shared transport schemas without touching existing application logic.
* **Deliverables**:
  1. Add `@cline/core` (or `@cline/sdk`) and `@types/bun` to root `package.json`. Run `npm install` to update `package-lock.json`.
  2. Create `lib/ai-agent/` directory with `transport-schema.ts`, `types.ts`, and `protocol-constants.ts`.
  3. Create `sidecar/tsconfig.json` ensuring isolated server-side type checking.
  4. Verify that `next build` continues to execute cleanly without bundler leaks.
* **Verification Gate**:
  - `npm run lint` passes with 0 errors.
  - `npm test` runs all 169 existing Vitest tests with 100% pass rate.
  - `cargo test --manifest-path src-tauri/Cargo.toml` passes all 12 tests.

---

### Stage 04: Internal Sidecar Backend Implementation
* **Objective**: Build the self-contained Bun server in `sidecar/`.
* **Deliverables**:
  1. `sidecar/server.ts`: Implement `Bun.serve` HTTP/WebSocket server with token authorization and loopback validation.
  2. `sidecar/provider-manager.ts`: Configure LLM providers (Anthropic, OpenRouter, Ollama, etc.).
  3. `sidecar/tool-coordinator.ts`: Tool execution pipeline with Plan/Act mode gating and approval promises.
  4. `sidecar/runtime.ts`: Wrap `ClineCore` to orchestrate task execution, streaming tokens, and conversation turns.
  5. `sidecar/session-store.ts`: Local disk persistence for sessions.
  6. `sidecar/index.ts`: Process entry point with CLI argument parsing and signal handling.
* **Verification Gate**:
  - Run sidecar headless via `bun run sidecar/index.ts --port 49152 --approval-token test-token`.
  - Execute automated test script verifying:
    - Handshake command success.
    - Token auth rejection (missing/invalid token fails with 401).
    - Session creation and mock turn streaming.
    - Plan Mode blocks mutating tool calls.

---

### Stage 05: Rust / Tauri Supervisor & IPC Integration
* **Objective**: Enable Tauri to supervise the sidecar lifecycle and expose connection endpoints to the webview.
* **Deliverables**:
  1. Create `src-tauri/src/state/backend.rs`: Define `DesktopBackendState` holding child process handle, port, and approval token.
  2. Create `src-tauri/src/commands/backend.rs`: Implement `get_desktop_backend_endpoint` and `restart_desktop_backend`.
  3. Update `src-tauri/src/lib.rs` and `main.rs`:
     - In `setup()`: Spawn sidecar child process with `--port <allocated>` and `--approval-token <csprng-token>`.
     - In exit hooks: Terminate sidecar child process cleanly.
     - On Windows, apply `CREATE_NO_WINDOW = 0x0800_0000`.
* **Verification Gate**:
  - `cargo test --manifest-path src-tauri/Cargo.toml` passes.
  - Launch Tauri development app (`npm run tauri:dev`); verify sidecar process spawns in background without popping a console window.
  - Query `get_desktop_backend_endpoint` via frontend console; verify valid port and token are returned.
  - Verify sidecar process terminates immediately when Kairo IDE window is closed.

---

### Stage 06: Frontend Transport & Agent Workspace UI
* **Objective**: Build the chat interface and reactive state projection in `features/ai-agent/`.
* **Deliverables**:
  1. `features/ai-agent/hooks/useDesktopTransport.ts`: Implement resilient WebSocket client with automatic reconnection and drop detection.
  2. `features/ai-agent/store/aiAgentStore.ts`: Lightweight state projection for active turns, messages, and streaming text.
  3. `features/ai-agent/components/AIAgentPanel.tsx`: Top-level sidebar container.
  4. `features/ai-agent/components/ChatMessageList.tsx` & `ChatMessageItem.tsx`: Markdown renderer, syntax highlighting, and reasoning traces.
  5. `features/ai-agent/components/ChatInput.tsx` & `ModeSelector.tsx`: Prompt textarea and Plan/Act mode toggle.
  6. Mount `AIAgentPanel` in main workbench layout (`app/page.tsx`).
* **Verification Gate**:
  - UI connects seamlessly to sidecar upon workbench launch.
  - User can send a prompt; response tokens stream in real time.
  - Switching between Plan Mode and Act Mode updates UI and backend state simultaneously.
  - Disconnecting and reconnecting network automatically rehydrates active session.

---

### Stage 07: Interactive Tool Approvals & Diff Inspection
* **Objective**: Implement secure human-in-the-loop tool approvals with visual diff preview.
* **Deliverables**:
  1. `features/ai-agent/components/ToolApprovalModal.tsx`: Visual dialog surfacing model actions before execution.
  2. `features/ai-agent/components/DiffReviewWidget.tsx`: Unified diff viewer for file creations and edits.
  3. Command execution prompt detailing exact shell command string.
  4. Implement approval and rejection handlers sending `respond_tool_approval` RPC.
* **Verification Gate**:
  - In Act Mode, triggering a file modification holds execution turn and presents diff modal.
  - Clicking "Approve" writes changes to disk and notifies Monaco editor via existing file watcher.
  - Clicking "Reject" passes rejection reason back to the agent; agent updates strategy accordingly.

---

### Stage 08: End-to-End Validation, Packaging & Delivery
* **Objective**: Package the complete application, write regression tests, and verify standalone execution.
* **Deliverables**:
  1. `scripts/build-sidecar.ts`: Bun compilation script compiling `sidecar/index.ts` into native binary in `src-tauri/bin/`.
  2. Update `src-tauri/tauri.conf.json` external binaries configuration.
  3. Add unit tests for `lib/ai-agent/` schemas and client hooks in `tests/`.
  4. Perform production build: `npm run tauri:build`.
* **Verification Gate**:
  - All 169 Vitest tests + new ai-agent tests pass.
  - Standalone release installer builds successfully.
  - Launch packaged executable on clean test environment (without Bun or Node installed); verify agent works end-to-end.
  - Final documentation updated and signed off.
