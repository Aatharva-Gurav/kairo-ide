# Troubleshooting

Common issues encountered when running or developing **Kairo IDE** and how to resolve them.

## 1. Terminal Spawns Mock Shell Instead of Real PowerShell / Bash

**Symptom**: Opening the integrated terminal displays `"Browser Mock Shell"` and echoes characters instead of running a real OS shell.

**Cause**: The app was opened directly in a browser via `npm run dev` instead of inside the native Tauri window (`window.__TAURI_INTERNALS__` is undefined).

**Fix**: Launch via `npx tauri dev` so the Rust `portable-pty` backend is attached.

---

## 2. Custom Shell Profile Rejected by Terminal Security Policy

**Symptom**: Saving a custom shell profile fails with `UnauthorizedExecutable`, `InvalidShellArgs`, or `BlockedEnvironmentVariable`.

**Cause**: `TerminalProfileService` (frontend) and `src-tauri/src/terminal/shells.rs` (backend) enforce allowlisted interactive shell binaries, forbid script execution flags (`-c`, `/c`, `-Command`, `-e`, etc.) and command separators (`&&`, `||`, `;`, `|`), and block security-sensitive env vars (`PATH`, `NODE_OPTIONS`, `LD_PRELOAD`, etc.).

**Fix**: Use a standard interactive shell binary name (`pwsh`, `powershell`, `cmd`, `bash`, `zsh`, `fish`, etc.) and interactive flags only (e.g., `-NoLogo`, `-l`), avoiding blocked environment overrides.

---

## 3. File Access Blocked (`SENSITIVE_PATH` / `OUTSIDE_WORKSPACE` / `SYMLINK_BLOCKED`)

**Symptom**: Opening, reading, saving, or copying certain files in a workspace fails with security errors.

**Cause**: `WorkspaceGuard` and `SensitivePathPolicy` (`src-tauri/src/security/`) intentionally block:
- Files outside authorized workspace roots (unless explicitly granted via native Open/Save-As dialogs)
- `.env*`, `.git/*`, `.ssh`, `.aws`, `secrets/`, `*.pem`, `*.key`, `credentials.json`, etc.
- Symlinks or Windows NTFS junctions that resolve outside the workspace or cross boundaries

**Fix**: Open the target folder explicitly via **Open Folder** or use **Open File** / **Save As** for isolated files. Sensitive credential paths are protected by design.

---

## 4. `ErrorEvent` Rejection or Worker Error in Next.js Dev Mode

**Symptom**: Browser console logs `[Kairo IDE] Handled unhandled ErrorEvent rejection` or Monaco worker fallback warnings.

**Cause**: Under Tauri CSP (`worker-src 'self';`), Monaco's default cross-origin/dynamic Web Workers are intercepted by `installMonacoWorkerStub()` ([`lib/monaco-worker-stub.ts`](../../lib/monaco-worker-stub.ts)) backed by `public/monaco-worker.js`, while `ErrorBoundaryGuard` prevents unhandled worker `ErrorEvent` objects from crashing the dev overlay.

**Fix**: No action needed unless editing worker behavior—syntax highlighting and editor features remain active on the main thread / stub worker.

---

## 5. Supabase Login Unavailable / Offline Mode Active

**Symptom**: Launching Kairo IDE logs `[Auth] Supabase is not configured. Falling back to Offline Mode.` and bypasses login.

**Cause**: `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing or still set to template placeholder values.

**Fix**: This is expected local behavior. If cloud accounts are needed, provide valid Supabase project credentials in `.env.local` and apply the schema migration under `supabase/migrations/`.

---

## 6. Windows `next dev` / Rust Incremental Cache Warnings

**Symptom**: Cargo logs `warning: hard linking files in the incremental compilation cache failed. copying files instead.`

**Cause**: Windows filesystem or antivirus locking during parallel incremental builds.

**Fix**: Informational compiler warning only; build and tests still complete normally.

## Related Documentation

- [Development Setup](setup.md)
- [Development Workflow](development-workflow.md)
- [Integrated Terminal Documentation](../features/terminal/README.md)
