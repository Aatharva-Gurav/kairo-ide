import packageJson from "@/package.json";

function normalizeVersionRange(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/^[\^~>=<\s]+/, "").trim();
  return cleaned || undefined;
}

/**
 * Returns the current Kairo IDE application version from build metadata or package.json.
 */
export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "0.1.0";
}

/**
 * Returns the installed Monaco Editor version from build metadata or package.json.
 */
export function getMonacoVersion(): string {
  return (
    process.env.NEXT_PUBLIC_MONACO_VERSION ||
    normalizeVersionRange(packageJson.dependencies?.["monaco-editor"]) ||
    "unknown"
  );
}
