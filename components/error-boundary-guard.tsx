"use client";

import { useEffect } from "react";

/**
 * Global client-side error guard.
 * Prevents opaque DOM ErrorEvents (from Web Worker initialization or dynamic script failures)
 * from crashing Next.js's runtime dev overlay as "[object ErrorEvent]".
 */
export function ErrorBoundaryGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason instanceof ErrorEvent ||
        (reason && typeof reason === "object" && ("isTrusted" in reason || reason.constructor?.name === "ErrorEvent"))
      ) {
        event.preventDefault();
        console.warn("[Kairo IDE] Handled unhandled ErrorEvent rejection:", reason);
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      // If error is null/undefined or an ErrorEvent and originates from a Worker/Script
      if (
        (!event.error || event.error instanceof ErrorEvent) &&
        (event.target instanceof Worker || (event.target as HTMLElement)?.tagName === "SCRIPT")
      ) {
        event.preventDefault();
        console.warn("[Kairo IDE] Handled resource error:", event.target);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return <>{children}</>;
}

