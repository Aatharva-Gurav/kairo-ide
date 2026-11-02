# 09 — State Ownership & Reconciliation Matrix

## 1. Principles of State Architecture

In a distributed desktop application comprising Next.js, a Bun-based sidecar, and Rust/Tauri native services, unambiguous state boundaries are essential to prevent race conditions, stale caches, and desynchronization.

The AI coding-agent integration adheres to three non-negotiable rules:

1. **Backend Owns Agent Execution**: The sidecar backend (encapsulating `@cline/core`) is the **single source of truth** for task execution, active tool approvals, token generation turns, and conversation history. React components are strictly reactive projections and must never independently synthesize or manipulate agent turns.
2. **Frontend Owns Local UI State**: The Next.js frontend owns ephemeral input text, draft messages, UI drawer toggles, scroll positions, and visual focus states.
3. **Rust Owns Process Supervision**: Tauri owns sidecar child process handles, assigned listening ports, and random security authentication tokens.
4. **No State Duplication**: The sidecar does not maintain an independent copy of file trees, editor buffers, or terminal instances. Instead, it queries existing Kairo services via adapters or receives current editor context via RPC parameters.

---

## 2. Complete State Ownership Matrix

| Domain | Entity | Authoritative Owner | Secondary Replicas | Persistence Target |
| :--- | :--- | :--- | :--- | :--- |
| **Process & Network** | Sidecar Process PID & Port | Rust (`DesktopBackendState`) | Frontend (via Tauri IPC query) | In-memory only (ephemeral) |
| **Process & Network** | Approval Token Secret | Rust (`DesktopBackendState`) | Frontend & Sidecar | In-memory only (ephemeral) |
| **Agent Sessions** | Active Session ID | Sidecar (`runtime.ts`) | Frontend (`aiAgentStore`) | Disk: `~/.kairo/sessions/active` |
| **Agent Sessions** | Historical Session List | Disk Storage Engine | Sidecar & Frontend Cache | Disk: `~/.kairo/sessions/*.meta.json` |
| **Agent Conversation** | Full Message Transcript | Sidecar (`session-store.ts`) | Disk Storage Engine | Disk: `~/.kairo/sessions/<id>.json` |
| **Agent Conversation** | Live Streaming Token Buffer | Sidecar (`runtime.ts`) | Frontend (`aiAgentStore`) | Ephemeral (appended on turn complete) |
| **Execution Governance**| Active Task & Turn State | Sidecar (`ClineCore`) | Frontend (`aiAgentStore`) | Ephemeral / Saved on checkpoint |
| **Execution Governance**| Pending Tool Approvals | Sidecar (`tool-coordinator.ts`) | Frontend (`ToolApprovalModal`) | Ephemeral (held in memory awaiting RPC response) |
| **Execution Governance**| Agent Mode (Plan vs Act) | Sidecar (`runtime.ts`) | Frontend (`ModeSelector`) | Persisted per-session in session metadata |
| **AI Providers** | Provider API Keys & URLs | Secure Local Storage / Disk | Sidecar (`provider-manager.ts`) | Encrypted/Secure file or OS Keychain |
| **Token Usage** | Token & Cost Counters | Sidecar (`ClineCore`) | Frontend (`TokenUsageBadge`) | Disk: Appended to session history |
| **Workspace & Code** | Open Editor Files & Dirty State| Frontend (`features/editor`) | Passed to Sidecar on message send | Managed by Kairo Monaco Editor |
| **Workspace & Code** | Disk Filesystem & Git State | Host OS / Tauri Rust FS | Inspected by Sidecar tools | Project directory on disk |
| **Interactive Terminal** | Shell Sessions & Output | Rust PTY Manager (`commands/pty.rs`) | Frontend (`features/terminal`) | PTY process buffer |

---

## 3. Detailed Domain Ownership & Flows

### 3.1. Agent Conversation & Streaming Turn Reconciliation

```
[User clicks Send]
       │
       ▼
1. Frontend captures user input and passes active editor file paths
       │
       ▼ (Command: send_user_message)
2. Sidecar (runtime.ts) validates command and instantiates new task turn in ClineCore
       │
       ├─► 3. Streams token deltas ───► Frontend appends to active streaming turn buffer
       │
       ├─► 4. Requests tool approval ─► Frontend displays ToolApprovalModal (waits)
       │                                       │
       │                                       ▼
       │                               User approves tool
       │                                       │
       │   ◄── (Command: respond_tool_approval)┘
       │
       ├─► 5. Executes tool on disk ──► Pushes tool result to transcript
       │
       └─► 6. Turn completes ─────────► Writes committed turn to disk (.json)
                                       Emits task_completed event
                                       Frontend flushes streaming buffer into committed message list
```

### 3.2. Reconciliation Rules During Reconnection
When network interruptions or restarts occur:
1. **Frontend Detects Disconnect**: Sets transport state to `reconnecting`. Displays non-intrusive status badge. Disables send button.
2. **Re-establishment**: Once the WebSocket reconnects and `handshake` succeeds:
3. **Session Rehydration**: Frontend issues `load_session({ sessionId: activeId })`.
4. **State Replacement**: Frontend completely replaces its in-memory message history with the authoritative transcript returned by the sidecar. Any incomplete streaming tokens are discarded in favor of the finalized server state.
5. **Pending Approvals Sync**: The backend re-emits any currently blocking `tool_approval_request` events so the user can continue their workflow without data loss.

### 3.3. Adapters for Existing Kairo Services
To prevent the sidecar from implementing redundant file trees or duplicating editor tracking:
- **Editor Context Adapter**: When the user sends a message, `useAIAgentSession` queries Kairo's active Monaco tab model (from `features/editor/store`) to extract the currently focused file path, visible line range, and selection. This context is attached to `send_user_message` as `contextFiles`.
- **Workspace File Watcher Adapter**: When the sidecar tool modifies a file on disk (`write_to_file` or `apply_diff`), Kairo's existing file-watcher (`features/file-explorer/services/fileWatcher.ts`) and Monaco's model synchronization automatically detect the file change on disk and prompt Monaco to refresh, ensuring editor models stay 100% in sync without custom sidecar hooks.
- **Terminal Execution Adapter**: Commands executed by the agent run directly through the sidecar's sandboxed tool execution engine, with options to mirror command execution outputs into an active Kairo PTY tab if configured.

---

## 4. Local UI vs Server State Separation

```typescript
// FRONTEND STATE (Zustand: aiAgentStore.ts)
interface AIAgentStoreState {
  // Connection
  connectionStatus: "disconnected" | "connecting" | "connected" | "reconnecting";
  backendPort: number | null;
  
  // UI Panels
  isPanelOpen: boolean;
  activeDrawer: "none" | "history" | "settings";
  
  // Ephemeral Input
  draftInput: string;
  selectedAttachments: FileAttachment[];
  
  // Authoritative State Projections (Replicated from Sidecar)
  currentSessionId: string | null;
  sessionMode: "plan" | "act";
  taskStatus: "idle" | "running" | "waiting_approval" | "error";
  messages: ChatMessage[];
  streamingTokenBuffer: string;
  streamingReasoningBuffer: string;
  pendingApproval: ToolApprovalRequest | null;
  
  // Actions (Strictly dispatch RPC commands to sidecar)
  sendMessage: (text: string) => Promise<void>;
  abortTask: () => Promise<void>;
  resolveApproval: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
}
```

By enforcing that all mutations go through the sidecar RPC and are reflected back via events, the UI is prevented from drifting out of synchronization with the agent's actual operational state.
