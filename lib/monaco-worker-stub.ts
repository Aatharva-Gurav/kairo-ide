/**
 * Offline Monaco Web Worker replacement.
 *
 * Monaco's editor-worker features dispatch over the SimpleWorker protocol.
 * Serving the protocol-compliant stub from the static `/monaco-worker.js` asset
 * satisfies strict CSP (`worker-src 'self'`) without requiring `blob:` URLs.
 */

interface MonacoEnvironmentStub {
  getWorker: (moduleId: unknown, label: string) => Worker;
}

/**
 * Registers the worker stub under `window.MonacoEnvironment`.
 * Kept idempotent: the first caller wins so Monaco never spawns workers
 * with different behavior mid-session.
 */
export function installMonacoWorkerStub(): void {
  if (typeof window === "undefined") return;

  const globalObj = window as unknown as { MonacoEnvironment?: MonacoEnvironmentStub };
  if (globalObj.MonacoEnvironment) return;

  globalObj.MonacoEnvironment = {
    getWorker: () => new Worker("/monaco-worker.js"),
  };
}
