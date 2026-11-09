# Kairo IDE – Terminal AI Execution Integration

## 1. Overview

The Kairo Terminal AI Execution subsystem provides a bridge between autonomous coding agents (such as Cline SDK agents) and the host operating system. It exposes structured, typed TypeScript and Rust interfaces for:
- Executing non-interactive commands synchronously with stdout/stderr capture.
- Running long-running background commands (e.g. `npm run dev`, `cargo watch`) with continuous log retrieval.
- Querying and stopping active background processes.
- Enforcing user approval gates and cryptographic audit logging.

---

## 2. TypeScript Adapter Interface (`AiTerminalExecutionAdapter`)

The adapter is located at [`features/terminal/services/ai-terminal-adapter.ts`](file:///c:/Users/Aatharva%20Gurav/Desktop/work/kairo-ide/features/terminal/services/ai-terminal-adapter.ts).

```typescript
export class AiTerminalExecutionAdapter {
  constructor(options?: AiAdapterOptions);

  // Synchronous execution
  run_command(request: RunCommandRequest): Promise<RunCommandResponse>;

  // Background execution
  run_background_command(request: RunBackgroundCommandRequest): Promise<RunBackgroundCommandResponse>;

  // Process output polling
  get_command_output(request: GetCommandOutputRequest): Promise<GetCommandOutputResponse>;

  // Process management
  list_running_processes(request?: ListProcessesRequest): Promise<ListProcessesResponse>;
  stop_process(request: StopProcessRequest): Promise<StopProcessResponse>;

  // Security policy configuration
  setApprovalRequester(requester: ApprovalRequester): void;
  addTrustedPattern(pattern: RegExp): void;
  getAuditLog(): readonly AuditRecord[];
}
```

---

## 3. Data Contracts & Payload Schemas

### 3.1 `run_command`
Executes a synchronous shell command and waits for completion or timeout.

**Request (`RunCommandRequest`)**:
```typescript
{
  command: string;          // Command string to execute
  cwd?: string;             // Optional directory (defaults to workspace root)
  timeoutMs?: number;       // Execution timeout in ms (default: 30000)
  maxOutputBytes?: number;  // Max stdout/stderr byte limit (default: 1048576)
}
```

**Response (`RunCommandResponse`)**:
```typescript
{
  exitCode: number;         // Process return code (0 = success, -1 = timeout)
  stdout: string;           // Standard output string (secrets redacted)
  stderr: string;           // Standard error string (secrets redacted)
  executionTimeMs: number;  // Total execution time in milliseconds
  truncated: boolean;       // True if output exceeded maxOutputBytes
}
```

---

### 3.2 `run_background_command`
Spawns a process in the background and returns an execution handle for asynchronous tracking.

**Request (`RunBackgroundCommandRequest`)**:
```typescript
{
  command: string;          // Command string to execute
  cwd?: string;             // Target working directory
  maxOutputBytes?: number;  // Max output buffer limit
}
```

**Response (`RunBackgroundCommandResponse`)**:
```typescript
{
  processId: number;        // OS Process Identifier (PID)
  executionId: string;      // Unique Kairo execution handle (e.g. "ai_proc_abc123")
  command: string;          // Normalized command string
  cwd: string;              // Resolved working directory
  startedAt: number;        // Epoch timestamp (ms)
}
```

---

### 3.3 `get_command_output`
Retrieves current accumulated output and execution status for a tracked background process.

**Request (`GetCommandOutputRequest`)**:
```typescript
{
  executionId: string;      // Execution handle returned by run_background_command
}
```

**Response (`GetCommandOutputResponse`)**:
```typescript
{
  executionId: string;
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number;
  stdout: string;           // Accumulated stdout (secrets redacted)
  stderr: string;           // Accumulated stderr (secrets redacted)
}
```

---

### 3.4 `stop_process`
Forcefully terminates a tracked background process and its entire child process tree.

**Request (`StopProcessRequest`)**:
```typescript
{
  executionId: string;      // Execution handle to terminate
  force?: boolean;          // Optional force termination flag
}
```

**Response (`StopProcessResponse`)**:
```typescript
{
  stopped: boolean;         // True if successfully terminated
  reason?: string;          // Error details if termination failed
}
```

---

## 4. Cryptographic Audit Log Schema

Every execution attempt produces an immutable `AuditRecord`:

```typescript
export interface AuditRecord {
  id: string;               // Unique audit record UUID
  timestamp: number;        // Unix epoch timestamp (ms)
  command: string;          // Command executed (with secret values redacted)
  cwd?: string;             // Target working directory
  action: "run" | "background" | "stop";
  decision: "approved" | "denied" | "auto_trusted" | "blocked_destructive";
  reason?: string;          // Justification or rejection reason
  exitCode?: number;        // Process exit code if executed
  executionTimeMs?: number; // Wall-clock execution duration in ms
}
```

Audit records can be exported or inspected in real-time by compliance monitoring plugins.
