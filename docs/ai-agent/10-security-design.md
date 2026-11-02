# 10 — Security Architecture & Isolation Boundaries

## 1. Threat Model & Security Principles

An AI coding agent with the capability to read project files, write code, edit directories, and execute shell commands presents significant potential attack surfaces if left ungoverned.

The Kairo IDE AI agent security architecture operates under the principle of **Defense in Depth** and adheres to five strict rules:

1. **Backend Enforces All Security**: React/UI components never act as the primary security barrier. The sidecar backend validates every command, checks tokens, restricts file paths, and enforces mode policies before executing any action.
2. **Loopback-Only Isolation**: The sidecar network socket is completely unreachable from the local network or internet.
3. **Least Privilege by Default**: Mutating tools (file writes, shell execution) are restricted unless explicitly permitted or approved by the user.
4. **Strict Workspace Boundary Enforcement**: The agent cannot access or modify files outside the user's explicitly opened workspace root.
5. **Zero Credential Leakage**: Sensitive API keys, session tokens, and environment secrets are never logged or exported in plain text.

---

## 2. Network & IPC Security Boundaries

```
[ External World ] ──X (Rejected: Non-loopback packets)
                             │
                             ▼
   ┌───────────────────────────────────────────────────┐
   │                  Local Machine                    │
   │                                                   │
   │  ┌─────────────────┐        Tauri IPC Channel     │
   │  │   Tauri / Rust  ├─────────────────────────┐    │
   │  │    Supervisor   │ (Spawns with token)     │    │
   │  └────────┬────────┘                         │    │
   │           │                                  ▼    │
   │           │ (Query endpoint)        ┌─────────────┤
   │           ▼                         │   Sidecar   │
   │  ┌─────────────────┐  WebSocket     │   Backend   │
   │  │ Next.js Frontend├────────────────► (Bun Server)│
   │  │  (Tauri Webview)│ Auth + Origin  └─────────────┤
   │  └─────────────────┘  Validation                  │
   └───────────────────────────────────────────────────┘
```

### 2.1. Loopback-Only Binding
- The Bun HTTP/WebSocket server explicitly binds to IP address `127.0.0.1`.
- Binding to `0.0.0.0`, `localhost` (which might resolve to external interfaces), or public network adapters is strictly prohibited in code.

### 2.2. Ephemeral Approval Token
- Upon spawning the sidecar child process, the Rust supervisor generates a cryptographically secure random token (32 bytes / 64 hex characters) using a CSPRNG.
- The token is passed to the sidecar process via a command-line argument (`--approval-token <token>`) and stored in Tauri managed state (`DesktopBackendState`).
- The frontend retrieves this token via the authenticated Tauri IPC command `get_desktop_backend_endpoint`.
- On every WebSocket connection upgrade, the server checks the `approval_token` query parameter using constant-time string comparison (`crypto.timingSafeEqual`) to eliminate timing attacks. Requests without a valid token are rejected with HTTP `401 Unauthorized`.

### 2.3. Origin Header Validation
During the WebSocket upgrade handshake, the backend verifies the `Origin` header against an allowlist:
- Packaged production builds: `tauri://localhost` or `https://tauri.localhost`.
- Local development mode: `http://localhost:3000` or `http://127.0.0.1:3000`.
- Any external origin (e.g. from a malicious website loaded in a web browser) is immediately rejected with HTTP `403 Forbidden`.

---

## 3. Tool Permissions & Operational Modes

The agent operates in two distinct operational modes: **Plan Mode** and **Act Mode**.

```
                   ┌───────────────────────────────┐
                   │    Incoming Model Tool Call   │
                   └───────────────┬───────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   ▼                               ▼
          [ Mode == "plan" ]               [ Mode == "act" ]
                   │                               │
        Is tool read-only?               Is tool read-only?
         (read_file, search)             (read_file, search)
          ┌────────┴────────┐             ┌────────┴────────┐
         Yes               No            Yes               No
          │                 │             │                 │
          ▼                 ▼             ▼                 ▼
     [ Execute ]     [ REJECT WITH ]  [ Execute ]   User auto-approval
                     [ PERMISSION  ]                configured?
                     [   ERROR     ]                 ┌──────┴──────┐
                                                    Yes            No
                                                     │              │
                                                     ▼              ▼
                                                [ Execute ]  [ HOLD FOR USER ]
                                                             [   APPROVAL    ]
```

### 3.1. Plan Mode Enforcement
When a session is in **Plan Mode**:
- **Permitted Tools**: Strictly read-only operations: `read_file`, `list_directory`, `search_files`, `inspect_ast`.
- **Prohibited Tools**: `write_to_file`, `apply_diff`, `execute_command`, `delete_file`.
- **Enforcement**: If the model attempts to invoke a mutating tool while in Plan Mode, the sidecar intercepts the call and immediately returns a tool error:
  `"Tool execution denied: mutating operations are prohibited in Plan Mode. Formulate your strategy and propose actions for user approval."`

### 3.2. Act Mode Governance
When in **Act Mode**:
- Read-only tools are automatically executed without pausing the workflow.
- Mutating tools (`write_to_file`, `apply_diff`, `execute_command`) generate a pending approval item with a unique UUID.
- The sidecar pauses execution of that task turn and pushes a `tool_approval_request` event containing:
  - Tool name and arguments.
  - Formatted unified diff for file modifications.
  - Full command line string for shell executions.
- The task turn only resumes upon receiving a signed `respond_tool_approval` command matching the active session and approval ID.

---

## 4. Workspace Sandboxing & Path Traversal Prevention

The sidecar protects host system files by strictly enforcing workspace root boundaries:

1. **Path Canonicalization**:
   Before reading, writing, or listing any path requested by the model, the path is resolved to its canonical absolute form:
   ```typescript
   import path from "node:path";
   import fs from "node:fs/promises";

   export function validatePathInWorkspace(targetPath: string, workspaceRoot: string): string {
     const resolved = path.resolve(workspaceRoot, targetPath);
     const relative = path.relative(workspaceRoot, resolved);
     
     // Detect path traversal attempts (e.g. "../../Windows/System32" or "/etc/passwd")
     if (relative.startsWith("..") || path.isAbsolute(relative)) {
       throw new SecurityError(`Access denied: path "${targetPath}" escapes workspace root.`);
     }
     return resolved;
   }
   ```
2. **Exclusion of Sensitive Files**:
   Even within the workspace, reads or modifications to sensitive credentials or configurations are blocked by default:
   - `.env`, `.env.*`
   - `.git/` internal objects
   - Private keys (`*.pem`, `*.key`, `id_rsa`, `id_ed25519`)
   - Cloud provider credentials (`aws/credentials`, etc.)

---

## 5. Secret Storage & Redaction

### 5.1. Provider API Keys
- User-provided API keys (Anthropic, OpenRouter, OpenAI, etc.) are never stored in unencrypted repository code or global git history.
- In production, keys are stored in the OS-level credential store / secure storage (or encrypted configuration file protected by user login credentials).
- The sidecar loads keys dynamically into process memory; keys are never transmitted back to the frontend in event streams.

### 5.2. Log & Stream Redaction
All logging mechanisms implement an automated secret-scrubbing filter:
```typescript
const SENSITIVE_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_\-]{40,}/g,           // Anthropic API keys
  /sk-[a-zA-Z0-9]{48,}/g,                  // OpenAI API keys
  /Bearer\s+[a-zA-Z0-9\._\-]+/gi,          // Bearer tokens
  /approval_token=[a-f0-9]{32,64}/gi,      // Approval tokens
];

export function redactSecrets(input: string): string {
  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED_SECRET]");
  }
  return sanitized;
}
```
All console outputs, diagnostic logs, and serialized disk transcripts pass through this sanitizer before emission.
