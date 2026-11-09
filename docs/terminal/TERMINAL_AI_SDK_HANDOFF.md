# Kairo IDE – Terminal & AI SDK Integration Handoff

> [!IMPORTANT]
> **Stage Boundary Notice**:
> This document marks the architectural handoff boundary between the completed **Stage 6: Terminal Subsystem Integration** and the subsequent **AI Agent / Cline SDK Tool Integration** phase.
> All terminal interfaces, PTY engines, security gates, and adapters documented below are stable, independently verified, and ready for consumption.

---

## 1. Executive Summary

The terminal integration has completed all hardening, security audits, and lifecycle tests. Two distinct execution modalities are available for AI agent integrations:

1. **Controlled Non-Interactive Adapter (`AiTerminalExecutionAdapter`)**:
   - Primary vehicle for coding agent tools (`execute_command`, `run_command`, `npm_test`, `cargo_check`).
   - Runs commands as isolated child process trees via standard piped stdio.
   - Enforces the user approval gate, secret redaction, output byte limits (1 MB), and execution timeouts.
2. **Interactive Developer Terminal (`TerminalManager` / `TerminalSession`)**:
   - Reserved strictly for human developers using interactive shells.
   - AI agents are architecturally prohibited from writing to or reading from user PTY sessions.

---

## 2. API Contract Reference for AI Tools

### 2.1 Available Controlled Execution APIs

| AI Agent Need | Adapter Method | Tauri Command Invoked |
| :--- | :--- | :--- |
| Run build/lint/test | `adapter.run_command(req)` | `ai_terminal_run_command` |
| Launch dev server / watcher | `adapter.run_background_command(req)` | `ai_terminal_run_background` |
| Poll dev server logs | `adapter.get_command_output(req)` | `ai_terminal_get_output` |
| List running background tools | `adapter.list_running_processes(req)` | `ai_terminal_list_processes` |
| Stop running background tool | `adapter.stop_process(req)` | `ai_terminal_stop_process` |

### 2.2 Cline Tool Bridge Example

When connecting a future Cline tool (e.g. `execute_command`), the implementation should wrap `AiTerminalExecutionAdapter`:

```typescript
import { AiTerminalExecutionAdapter } from "@/features/terminal/services/ai-terminal-adapter";

const aiAdapter = new AiTerminalExecutionAdapter({
  maxOutputBytes: 1024 * 1024,
  timeoutMs: 30000,
});

// Configure UI approval modal callback
aiAdapter.setApprovalRequester(async ({ command, cwd, isBackground }) => {
  // Surface confirmation dialog in AI chat panel
  const userDecision = await promptUserForCommandApproval({
    command,
    cwd,
    isBackground,
  });
  return userDecision; // true or false
});

export async function handleClineExecuteCommandTool(args: {
  command: string;
  cwd?: string;
  isBackground?: boolean;
}) {
  if (args.isBackground) {
    const res = await aiAdapter.run_background_command({
      command: args.command,
      cwd: args.cwd,
    });
    return {
      success: true,
      executionId: res.executionId,
      pid: res.processId,
    };
  } else {
    const res = await aiAdapter.run_command({
      command: args.command,
      cwd: args.cwd,
    });
    return {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      truncated: res.truncated,
    };
  }
}
```

---

## 3. Session Ownership & Workspace Restrictions

1. **Workspace Boundary**:
   - By default, all commands execute with `cwd` set to the active workspace root (`useWorkspaceStore.getState().activeWorkspace?.rootPath`).
   - If an AI agent attempts to execute commands outside the workspace root, the approval prompt will display a prominent warning to the user indicating out-of-workspace file modification.
2. **Process Group Ownership**:
   - Every background execution is tracked in the Rust `AiCommandExecutor` registry.
   - Terminating an execution via `stop_process` or closing Kairo IDE terminates the entire child process tree.

---

## 4. Remaining Work for Next AI SDK Phase

The terminal backend is completely ready. The only tasks remaining for the subsequent AI SDK phase are:
1. **Chat UI Approval Dialog**: Integrate the `ApprovalRequester` callback with the AI chat message feed so approval buttons ("Allow", "Deny", "Always Allow for this Workspace") render inline.
2. **Cline Tool Registration**: Expose `execute_command` and `run_background_command` within the Cline sidecar tool schema definition.
3. **Background Process Panel in Chat**: Surface active background tasks (e.g. `npm run dev`) with a live status indicator and a "Stop" button in the AI chat sidebar.
