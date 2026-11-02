# 03 — Runtime and Dependency Compatibility Analysis

## Executive Summary

Kairo IDE is an independent desktop application, completely decoupled from the Cline monorepo.

This audit analyzed the published npm packages `@cline/sdk` and `@cline/core`, their public exports, runtime constraints, and compatibility with Kairo's stack: Next.js 16 (React 19), Tauri v2 (Rust), and Bun.

---

## 1. Verified Published Packages on NPM

Investigation of the npm public registry confirms the following package releases:

| Package | Published Version | Tag | Engines | Published Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **`@cline/sdk`** | `0.2.0` | `latest` | `node: >=22` | `@cline/core: 0.2.0` |
| **`@cline/core`** | `0.2.0` | `latest` | `node: >=22` | `@cline/llms: 0.2.0`, `@cline/agents: 0.2.0`, `@cline/shared: 0.2.0`, `@modelcontextprotocol/sdk: ^1.29.0`, `@opentelemetry/*`, `simple-git: 3.36.0`, `ws: ^8.20.0`, `zod: ^4.3.6`, `jiti: ^2.7.0`, `yaml: ^2.8.2`, `nanoid: ^5.1.7`, `proxy-from-env`, `http-proxy-agent`, `https-proxy-agent`, `node-machine-id` |
| **`@cline/shared`** | `0.2.0` | `latest` | `node: >=22` | Shared schemas, storage paths, telemetry types |
| **`@cline/llms`** | `0.2.0` | `latest` | `node: >=22` | Provider integrations, model catalogs |
| **`@cline/agents`** | `0.2.0` | `latest` | `node: >=22` | Agent execution runtime |

### Critical Finding: `@cline/sdk` vs `@cline/core`
Inspection of the official `@cline/sdk/package.json` and its entry point confirms:
- **Package description**: `"Cline SDK - user-facing alias for @cline/core"`
- **Entry point (`src/index.ts`)**:
  ```typescript
  export * from "@cline/core";
  ```
- Therefore, **`@cline/sdk` is an official public alias for `@cline/core`**. Everything in `@cline/core` is exported directly by `@cline/sdk`.
- Furthermore, `@cline/core` provides subpath exports:
  - `@cline/core` (root core runtime, `ClineCore`, `ContributionRegistry`, `createTool`, `buildClineSystemPrompt`)
  - `@cline/core/hub` (Hub client adapters: `NodeHubClient`, `HubSessionClient`, `HubUIClient`, `connectToHub`)
  - `@cline/core/telemetry`
  - `@cline/core/cloud`

---

## 2. Workspace Dependencies vs Standalone Installation

In the official Cline monorepo, packages reference each other with `workspace:*` (e.g. `"@cline/core": "workspace:*"`).

### Mandatory Rule for Kairo:
- **NEVER use `workspace:*` inside Kairo IDE**.
- All dependencies must be referenced using standard published semantic versions (e.g. `^0.2.0` for `@cline/sdk` or `@cline/core`).
- All sub-packages (`@cline/shared`, `@cline/llms`, `@cline/agents`) are automatically installed as normal npm dependencies by `@cline/core`.

---

## 3. Runtime Compatibility: Node.js vs Bun

### Engine Requirements
`@cline/core` declares `engines: { "node": ">=22" }`.

### Bun Compatibility
- The official Cline desktop app runs the sidecar **exclusively on Bun**:
  - `sidecar/index.ts` enforces:
    ```typescript
    if (!BunRuntime) {
      throw new Error("sidecar must be run with Bun");
    }
    ```
  - The sidecar HTTP and WebSocket server uses `Bun.serve({ hostname, port, fetch, websocket })`.
  - Bun provides built-in WebSocket handling, fast startup (<50ms), and native TypeScript execution without prior compilation.
- **Verification on Windows**: Bun is fully supported on Windows x64.
- In addition, Bun allows compiling the sidecar into a self-contained native executable (`bun build --compile sidecar/index.ts --outfile src-tauri/bin/kairo-sidecar.exe`), solving distribution without requiring users to have Bun or Node installed.

---

## 4. Public API Verification

### 4.1 `ClineCore` Lifecycle APIs
Direct usage of `ClineCore` is officially supported and documented in `sdk/ARCHITECTURE.md`:
```typescript
import { ClineCore } from "@cline/sdk"; // or from "@cline/core"

const sessionManager = await ClineCore.create({
  clientName: "kairo-ide",
  backendMode: "hub", // or "standalone"
  capabilities: {
    toolExecutors: {
      askQuestion: async (question, options, context) => { ... },
    },
    requestToolApproval: async (request) => { ... },
  },
  logger: customLogger,
  telemetry: customTelemetry,
  hub: {
    strategy: "require-hub", // connects to or launches daemonized Hub
    workspaceRoot: "/path/to/project",
    cwd: "/path/to/project",
    clientType: "code-sidecar",
    displayName: "Kairo IDE Sidecar",
  },
});
```

### 4.2 Session Management APIs
- **Create Session**:
  ```typescript
  const session = await sessionManager.create({
    workspaceRoot: string,
    provider: string,
    model: string,
    mode: "act" | "plan",
    enableTools: boolean,
    systemPrompt?: string,
  });
  ```
- **Send User Turn**:
  ```typescript
  await sessionManager.send(sessionId, {
    prompt: string,
    attachments?: Attachment[],
  });
  ```
- **Stop / Abort Turn**:
  ```typescript
  await sessionManager.abort(sessionId, "user_cancelled");
  ```
- **Subscribe to Session Events**:
  ```typescript
  const unsubscribe = sessionManager.subscribe((event: CoreSessionEvent) => {
    // Relays event.type, event.payload, event.sequence
  });
  ```
- **Resume Session from Disk**:
  ```typescript
  const session = await sessionManager.resume({
    sessionId: string,
    workspaceRoot: string,
  });
  ```

### 4.3 Tool Approval APIs
Tool approvals are handled via asynchronous callbacks registered in runtime capabilities:
- **Interface**:
  ```typescript
  export interface ToolApprovalRequest {
    approvalId: string;
    sessionId: string;
    toolName: string;
    input: Record<string, unknown>;
    riskLevel?: "low" | "medium" | "high";
  }

  export interface ToolApprovalResult {
    approved: boolean;
    reason?: string;
  }
  ```
- The callback returns a Promise that halts tool execution until resolved.
- Resolving is executed through the Hub client or internal state:
  ```typescript
  hubClient.command("approval.respond", { approvalId, approved, reason }, sessionId);
  ```

### 4.4 Provider Configuration APIs
- Provider configuration is handled by `ProviderSettingsManager` and `toProviderConfig` from `@cline/core`.
- Supported providers: Anthropic, OpenAI, OpenRouter, Google Gemini, AWS Bedrock, Ollama, LM Studio, DeepSeek, Mistral, Groq, Azure OpenAI.
- API keys are securely persisted in `~/.cline/data/settings/providers.json` with file permissions `0600`.

### 4.5 Persistence Architecture
- History is persisted automatically by the runtime under `~/.cline/data/sessions/<sessionId>/`.
- Canonical files:
  - `<sessionId>.messages.json`: Full turn message array with token usage, assistant thinking, and tool execution outputs.
  - `manifest.json`: Session creation metadata (model, provider, mode, timestamp).
  - `checkpoints/`: File snapshots before and after agent modifications.

---

## 5. Dependency Strategy for Kairo IDE

Kairo IDE's root `package.json` is a Next.js frontend with `"output": "export"`.

### Crucial Architectural Separation:
1. **Frontend dependencies (`package.json`)**:
   - MUST NOT include `@cline/sdk` or `@cline/core` directly in frontend dependencies.
   - Including `@cline/core` in the Next.js bundle would fail build-time static export because `@cline/core` depends on Node.js native modules (`node:fs`, `node:child_process`, `simple-git`, `ws`, `nanoid`).
   - Frontend needs only lightweight transport and schema types (`zod`, WebSocket client).
2. **Sidecar dependencies**:
   - The sidecar MUST live inside an internal directory: `sidecar/`.
   - The sidecar runs in Bun (or standalone compiled executable).
   - The sidecar imports `@cline/sdk` (or `@cline/core`), `ws`, `zod`, and manages the AI agent runtime independently from the React UI bundle.
3. **No Vite, No Monorepo Workspace**:
   - The sidecar does not need a Vite build step or separate repository.
   - Bun runs TypeScript natively (`bun run sidecar/index.ts`) in development, and can bundle or compile directly with zero extra tooling.
