# Development Setup

This guide explains how to set up a local development environment for **Kairo IDE** (both desktop Tauri mode and browser UI mode).

## Prerequisites

1. **Node.js & npm**: Node.js 20+ (compatible with Next.js 16 and React 19) with `npm`.
2. **Rust Toolchain**: Stable Rust (`rustc`, `cargo`, `rustfmt`, `clippy`) installed via `rustup` for the Tauri v2 backend in `src-tauri/`.
3. **Tauri v2 System Dependencies**:
   - **Windows**: Microsoft C++ Build Tools (MSVC) and WebView2 Runtime (pre-installed on Windows 10/11).
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
   - **Linux (Debian/Ubuntu)**: WebKitGTK and GTK development packages required by Tauri v2 (`libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`).

## Installation

Install frontend dependencies from the repository root:

```bash
npm install
```

Cargo dependencies are resolved automatically on the first Tauri or Cargo run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
```

## Optional Supabase Environment Configuration

Kairo IDE runs fully locally in **Offline Mode** out of the box when Supabase is unconfigured. To enable cloud authentication and profile persistence, create `.env.local` in the repository root and define:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> **Note**: Placeholder URLs (`your-project.supabase.co`) or keys (`your-anon-key-here`) are automatically treated as unconfigured by `getSupabaseConfig()` in [`lib/supabase/client.ts`](../../lib/supabase/client.ts), triggering Offline Mode fallback. `.env*` files are gitignored and blocked from IDE filesystem reads by `SensitivePathPolicy`.

If provisioning your own Supabase project, apply the database migration in:
- [`supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql`](../../supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql)

## Running the Application

### 1. Desktop Application (Full Tauri + Rust PTY + Native FS)

```bash
npx tauri dev
```

`src-tauri/tauri.conf.json` configures Tauri to run `npm run dev` (`http://localhost:3000`) automatically before launching the native window.

### 2. Browser Frontend Only (UI / Mock IPC Mode)

```bash
npm run dev
```

Open `http://localhost:3000` in a browser. When `__TAURI_INTERNALS__` is absent, [`lib/tauri-ipc.ts`](../../lib/tauri-ipc.ts) and [`TerminalIpcService`](../../features/terminal/services/terminal-ipc.service.ts) gracefully fall back to browser mock behavior.

## Related Documentation

- [Development Workflow](development-workflow.md)
- [Troubleshooting](troubleshooting.md)
- [Build and Packaging](../release/build-and-packaging.md)
