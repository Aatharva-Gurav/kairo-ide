/**
 * Safe accessor for localStorage across Browser, SSR (Node.js), and Vitest test environments.
 * Avoids triggering Node 22+ ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
 */
export function getSafeLocalStorage(): Storage | null {
  if (typeof window !== "undefined") {
    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  // In Node.js / SSR: check if a test suite has polyfilled localStorage on global / globalThis.
  // Avoid referencing bare `localStorage` or `globalThis.localStorage` directly in Node 22+
  // because Node defines an experimental getter that emits ExperimentalWarning if --localstorage-file is omitted.
  try {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    if (desc && "value" in desc && desc.value) {
      return desc.value as Storage;
    }
  } catch {
    return null;
  }

  return null;
}

