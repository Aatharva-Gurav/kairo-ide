# 04 — Existing Feature Integration Map

## Executive Summary

The AI coding-agent subsystem must integrate cleanly into Kairo IDE without disrupting, rewriting, or endangering any of Kairo's existing features, passing tests, or native capabilities.

This document establishes the precise integration map, data flow boundaries, and strict non-interference guarantees.

---

## 1. Subsystem Integration Seams

```
+-----------------------------------------------------------------------------------+
|                                 Kairo IDE Frontend                                |
|                                                                                   |
|  +--------------------+   +----------------------+   +-------------------------+  |
|  | Workspace Context  |   | File Explorer Store  |   | Monaco Editor Subsystem |  |
|  | - activeWorkspace  |   | - fsWatcher          |   | - ModelService          |  |
|  | - rootPath         |   | - explorer:refreshed |   | - isDirty / saveDoc     |  |
|  +---------+----------+   +----------+-----------+   +------------+------------+  |
|            |                         |                            |               |
|            +-------------------------+----------------------------+               |
|                                      |                                            |
|                                      v                                            |
|                        +---------------------------+                              |
|                        |   Typed IDE Event Bus     |                              |
|                        |    (`lib/events.ts`)      |                              |
|                        +-------------+-------------+                              |
|                                      |                                            |
|                                      v                                            |
|                        +---------------------------+                              |
|                        | AI Agent Client & Hooks   |                              |
|                        | (`features/ai-agent/`)    |                              |
|                        | - useChatSession()        |                              |
|                        | - DesktopClient (WS)      |                              |
|                        +-------------+-------------+                              |
+--------------------------------------|--------------------------------------------+
                                       |
                   (Local WebSocket Bridge: `ws://127.0.0.1:<port>/transport`)
                                       |
+--------------------------------------v--------------------------------------------+
|                         Internal Sidecar (`sidecar/`)                             |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | HTTP / WebSocket Server (`server.ts`)                                       |  |
|  | - Port negotiation (preferred vs fallback 0)                                |  |
|  | - Origin validation & constant-time approval token verification             |  |
|  +-----------------------------------------------------------------------------+  |
|  | Command Router & State Coordinator (`context.ts`, `commands.ts`)            |  |
|  | - Tool approval promise lifecycle (`requestToolApproval`)                  |  |
|  | - Interactive question lifecycle (`askQuestion`)                           |  |
|  | - Process context resolution (`workspaceRoot` / `cwd`)                      |  |
|  +-----------------------------------------------------------------------------+  |
|  | ClineCore Agent Engine (`chat-session.ts`, `@cline/sdk`)                    |  |
|  | - Turn execution, thinking blocks, prompt queuing, tool execution          |  |
|  | - File system operations, bash commands, MCP servers                       |  |
|  | - History persistence in `~/.cline/data/sessions/`                          |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                       ^
                                       | (Process Supervision & Stdio Capture)
+--------------------------------------|--------------------------------------------+
|                         Native Host (`src-tauri/`)                                |
|                                                                                   |
|  - `main.rs`: `DesktopBackendState` spawns sidecar (CREATE_NO_WINDOW on Win)      |
|  - Reads `ready` JSON line on stdout to obtain dynamic WebSocket endpoint          |
|  - Exposes `get_desktop_backend_endpoint` to webview via Tauri IPC                 |
|  - Kills sidecar on window close / application shutdown                           |
+-----------------------------------------------------------------------------------+
```

---

## 2. Feature-by-Feature Integration Details

### 2.1 Workspace Integration (`features/workspace/`)
- **Current State**:
  - `useWorkspace()` provides `activeWorkspace: Workspace | null` with `rootPath: string`.
  - Emits `workspace:opened` and `workspace:switched` via `ideEvents`.
- **Integration Boundary**:
  - When a session is initiated, the agent config binds its `workspaceRoot` and `cwd` directly to `activeWorkspace.rootPath`.
  - When the user switches workspaces, the AI subsystem receives the `workspace:switched` event from `ideEvents`, halts any local workspace session, and switches active session context to the newly selected workspace.
  - Project characteristics detected by `workspace_detect_project` (Node.js, Rust, Python, etc.) can be forwarded to the agent's system prompt instructions.

### 2.2 File Explorer Integration (`features/file-explorer/`)
- **Current State**:
  - `FileExplorer` uses lazy loading via `fs_read_directory`.
  - Listens to `watcher:fs-changed` and `explorer:refreshed` events.
- **Integration Boundary**:
  - When the AI agent creates, edits, or deletes files on disk:
    1. The sidecar completes the file write.
    2. Sidecar emits file change notifications over the WebSocket event stream (`chat_event` with tool call results).
    3. The frontend triggers `ideEvents.emit("explorer:refreshed")` and `fsWatcher.notify({ type, path })`.
    4. The File Explorer tree node refreshes automatically without needing manual user reloads.

### 2.3 Monaco Editor Subsystem (`features/editor/`)
- **Current State**:
  - `ModelService` enforces a strict 1:1 mapping between file URI and `ITextModel`.
  - `EditorService` detects external file modifications.
  - Multi-tab document strip, split panes, and dirty state confirmation.
- **Integration Boundary**:
  - **Live Content Synchronization**: When the agent modifies an open file, `ModelService.updateContent(path, newContent)` can be called to update the editor buffer in real-time, preserving cursor position and undo history.
  - **File Reveal**: When the agent references a file in its response or tool call, clicking the file link in the chat invokes `openDocument(filePath)` to open the file in a Monaco tab.
  - **Diff Review Mode**: For tool review (e.g. before applying an edit), the existing split-pane infrastructure or Monaco Diff Editor can render before/after diffs side-by-side.

### 2.4 Command Palette and Keyboard Shortcuts (`features/commands/`)
- **Current State**:
  - `CommandRegistry` registers actions with categories (File, Edit, View, Workspace, Theme, Help).
  - `KeybindingService` handles scoped and global shortcut dispatch.
- **Integration Boundary**:
  - Register AI commands in `CommandRegistry`:
    - `kairo.ai.toggleChat`: Toggle AI Assistant panel (`Ctrl+Shift+A` or `Cmd+Shift+A`).
    - `kairo.ai.newSession`: Start new AI session (`Ctrl+Shift+L` or `Cmd+Shift+L`).
    - `kairo.ai.explainCode`: Explain selected code in active Monaco editor.
    - `kairo.ai.fixErrors`: Send Monaco diagnostics to AI agent.
  - These commands simply dispatch to the AI store or toggle sidebar visibility.

### 2.5 User Interface Layout (`components/app-sidebar.tsx`)
- **Current State**:
  - `AppSidebar` has a punch-hole toggle button, a header with tabs (`Explorer` and `Search`), and a footer with `Settings`.
- **Integration Boundary**:
  - Add an `"assistant"` (or `"ai"`) tab to the `AppSidebar` header alongside `Explorer` and `Search`, OR provide a collapsible right drawer/dock.
  - When active, the sidebar content renders the AI Chat panel:
    - Session history selector / New session button.
    - Chat message list with thinking blocks, markdown rendering, tool execution bubbles, and file diff previews.
    - Tool approval action cards (Approve / Reject buttons with reason input).
    - Chat input bar with model/provider selector, mode toggle (Act / Plan), and image/file attachment buttons.

### 2.6 Native Tauri Host (`src-tauri/`)
- **Current State**:
  - `src-tauri/src/lib.rs` registers 25 FS, window, and menu commands.
  - `src-tauri/src/main.rs` contains `app_lib::run()`.
- **Integration Boundary**:
  - Add `DesktopBackendState` in Rust to supervise the internal sidecar process.
  - Add 1 new Tauri command: `get_desktop_backend_endpoint()`.
  - Hook into `tauri::Builder` setup and exit lifecycle to ensure the sidecar starts and terminates cleanly.
  - **No changes to existing 25 filesystem or window commands**.

### 2.7 Settings Subsystem (`features/settings/`)
- **Current State**:
  - `SETTINGS_REGISTRY` (`features/settings/registry.ts`) manages categories and options.
- **Integration Boundary**:
  - Add an `"ai"` category to `SETTINGS_REGISTRY`:
    - `ai.provider`: Default provider (Anthropic, OpenAI, OpenRouter, Gemini, Ollama, etc.).
    - `ai.model`: Default model ID.
    - `ai.autoApproveTools`: Toggle for automatic tool approval.
    - `ai.thinkingEnabled`: Enable/disable reasoning tokens.
  - API keys are managed through the sidecar provider settings manager (`~/.cline/data/settings/providers.json`), ensuring secret credentials are not stored in unencrypted browser localStorage.

### 2.8 Authentication & Offline Mode (`features/auth/`)
- **Current State**:
  - Full offline guest mode fallback when Supabase is unconfigured.
- **Integration Boundary**:
  - The AI coding agent functions **100% in Offline Mode**.
  - No cloud Supabase account is required to use the AI assistant:
    - Users can use local LLM providers (Ollama, LM Studio) completely offline.
    - Users can supply their own direct API keys for commercial providers (Anthropic, OpenAI, Google Gemini).
    - Supabase auth is never coupled to AI session persistence or tool execution.

---

## 3. Existing Features That MUST REMAIN UNTOUCHED

To ensure regression-free stability, the following existing files and systems are designated strictly off-limits to modification:

1. **`src-tauri/src/commands/fs.rs`**: All existing 16 filesystem commands (`fs_read_file`, `fs_write_file`, `fs_delete`, `fs_search_workspace`, etc.) must remain untouched.
2. **`src-tauri/src/commands/workspace.rs`**: Folder picking, path validation, and project detection logic must remain untouched.
3. **`src-tauri/src/menu.rs`**: Native context menus and popup positioning must remain untouched.
4. **`lib/tauri-ipc.ts`**: The core IPC caller and in-browser VFS fallback must not be altered.
5. **`features/editor/services/model.service.ts`**: Monaco model caching, disposal, and viewState preservation must not be disrupted.
6. **`features/theme/registry.ts`**: All 14 built-in color themes must remain untouched.
7. **`features/auth/store.tsx`**: Supabase authentication and offline guest mode transition rules must remain unchanged.
8. **`features/workspace/service.ts`**: MRU workspace tracking and validation must not be altered.
