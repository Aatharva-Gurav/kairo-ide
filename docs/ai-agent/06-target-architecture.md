# 06 — Kairo AI Agent Target Architecture

## 1. Architectural Overview

The Kairo AI coding-agent subsystem is designed as an internal, process-isolated companion service embedded directly into the Kairo IDE desktop application.

It unites three distinct tiers into a single cohesive desktop IDE:
1. **Frontend Presentation Shell (Next.js 16 + React 19)**: The existing static-export webview providing editor panes, workspace trees, command palettes, and the newly integrated AI Assistant interface.
2. **Internal Agent Companion (Bun TypeScript Sidecar)**: A lightweight, headless process residing in the internal `sidecar/` directory that initializes and hosts `ClineCore` (`@cline/sdk`), manages agent execution turns, handles tool permissions, and communicates via a loopback WebSocket.
3. **Native Host & Supervisor (Tauri v2 + Rust)**: The native desktop wrapper supervising the lifecycle of the sidecar process, mediating OS window events, handling native dialogs, and securely passing endpoints to the webview.

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend ["Kairo Frontend (Next.js 16 + React 19 / Webview)"]
        UI["AI Assistant UI\n(features/ai-agent/components)"]
        Hook["Session State & Streaming\n(useChatSession hook)"]
        Client["Desktop WebSocket Client\n(features/ai-agent/services/desktop-client.ts)"]
        Bus["IDE Event Bus\n(lib/events.ts)"]
        Editor["Monaco Subsystem\n(features/editor)"]
        WSContext["Workspace Context\n(features/workspace)"]

        UI --> Hook
        Hook --> Client
        Hook --> Bus
        Bus <--> Editor
        WSContext --> Hook
    end

    subgraph Native ["Host Shell (Tauri v2 + Rust)"]
        Supervisor["DesktopBackendState Supervisor\n(src-tauri/src/main.rs)"]
        IPC["Tauri IPC Bridge\nget_desktop_backend_endpoint"]
        NativeFS["Existing 25 FS & Window Commands\n(src-tauri/src/commands)"]
    end

    subgraph Sidecar ["Internal AI Sidecar (sidecar/ - Bun Runtime)"]
        Server["HTTP & WebSocket Gateway\n(sidecar/server.ts)"]
        Router["Command Router\n(sidecar/command-router.ts)"]
        Context["Sidecar Context & Tool Approvals\n(sidecar/context.ts)"]
        SessionMgr["Chat Session Manager\n(sidecar/chat-session.ts)"]
        Core["ClineCore Runtime\n(@cline/sdk / @cline/core)"]
        Tools["Built-in Tools & MCP\n(FS, Command, Search, Diff)"]

        Server --> Router
        Router --> Context
        Context --> SessionMgr
        SessionMgr --> Core
        Core --> Tools
    end

    subgraph Storage ["Local Storage (~/.cline/data)"]
        Sessions["Session Messages & Manifests\n(~/.cline/data/sessions/<id>/)"]
        Providers["Provider Settings & Secrets\n(~/.cline/data/settings/providers.json)"]
    end

    Supervisor -- "Spawns child with CREATE_NO_WINDOW" --> Sidecar
    Supervisor -- "Reads stdout ready line" --> Supervisor
    Client -- "invoke('get_desktop_backend_endpoint')" --> IPC
    IPC -- "Returns ws://127.0.0.1:<port>/transport?token=..." --> Client
    Client <== "Bidirectional WebSocket JSON RPC (/transport)" ==> Server
    Core <--> Storage
```

---

## 3. End-to-End Operational Lifecycle

### 3.1 Startup & Handshake Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Tauri as Tauri Host (Rust)
    participant Sidecar as Internal Sidecar (Bun)
    participant Webview as Next.js Webview

    User->>Tauri: Launch Kairo IDE
    Tauri->>Sidecar: Spawn sidecar (bun run sidecar/index.ts / binary)
    Note over Sidecar: Selects available port (3126 or 0)<br/>Generates approval_token (UUID v4)<br/>Binds to 127.0.0.1
    Sidecar-->>Tauri: Output ready JSON to stdout: { type: "ready", wsEndpoint: "..." }
    Tauri->>Tauri: Store wsEndpoint in DesktopBackendState
    Webview->>Tauri: invoke("get_desktop_backend_endpoint")
    Tauri-->>Webview: Return wsEndpoint URL
    Webview->>Sidecar: WebSocket Connect (/transport?approval_token=...)
    Sidecar->>Sidecar: Validate Origin header & constant-time token check
    Sidecar-->>Webview: WS Event: host_ready { pid, mode }
    Webview->>Sidecar: WS Command: get_feature_flags
    Sidecar-->>Webview: WS Response: { flags, workspaceRoot }
```

### 3.2 Turn Execution and Tool Approval Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Chat UI (React)
    participant Client as DesktopClient (WS)
    participant Sidecar as Sidecar Router
    participant Core as ClineCore (@cline/sdk)
    participant Disk as Local Filesystem

    User->>UI: Enter prompt: "Refactor utils.ts"
    UI->>Client: chat_session_command (action: "start" / "send")
    Client->>Sidecar: WS Command: chat_session_command { prompt, mode: "act" }
    Sidecar->>Core: sessionManager.send(prompt)
    Core-->>Sidecar: CoreSessionEvent: stream delta (assistant content)
    Sidecar-->>Client: WS Event: chat_event { chunk: "I will edit utils.ts..." }
    Client-->>UI: Live token rendering in message thread

    Note over Core: Agent decides to call write_to_file
    Core->>Sidecar: requestToolApproval({ tool: "write_to_file", path: "utils.ts" })
    Note over Sidecar: Pauses execution on internal Promise
    Sidecar-->>Client: WS Event: tool_approval_request { approvalId: "appr-1", tool: "write_to_file", ... }
    Client-->>UI: Display Tool Approval Card (Diff preview, Approve / Reject buttons)
    User->>UI: Clicks "Approve"
    UI->>Client: respond_tool_approval { approvalId: "appr-1", approved: true }
    Client->>Sidecar: WS Command: respond_tool_approval { approvalId: "appr-1", approved: true }
    Sidecar->>Sidecar: Resolve internal approval Promise
    Sidecar->>Core: Return approval result
    Core->>Disk: Apply changes to utils.ts
    Core-->>Sidecar: Tool executed successfully
    Sidecar-->>Client: WS Event: chat_event { tool_call_end: { tool: "write_to_file", success: true } }
    Client->>UI: Update tool card to completed state
    Client->>UI: Emit explorer:refreshed on IDEEventBus
```

---

## 4. Key Architectural Decisions

1. **Process Isolation Over Shared Heap**:
   - The AI agent runtime runs in its own OS process, decoupled from the Next.js frontend webview.
   - Any crash, CPU spike, or memory leak in AI streaming or complex AST indexing cannot crash the editor or freeze Monaco typing.
2. **Standard Loopback WebSocket Bridge**:
   - Matches the official Cline desktop architecture (`/transport`).
   - Enables bi-directional, full-duplex communication without polling.
   - Single port allocation with dynamic fallback (`0`) prevents port collision errors.
3. **No Monorepo Leaks**:
   - The sidecar relies entirely on published, standard semantic-version packages from npm (`@cline/sdk@^0.2.0`).
   - No `workspace:*` dependencies.
4. **Next.js Static Export Protection**:
   - Node-only native binaries (`@cline/core`, `ws`, `nanoid`, `simple-git`) reside solely within the `sidecar/` execution tree.
   - The Next.js frontend maintains its pristine `output: "export"` static compatibility.
5. **Zero Disruption to Existing Kairo Features**:
   - Existing 25 Rust commands, Monaco model caching, 14 color themes, and offline guest authentication remain 100% untouched.
