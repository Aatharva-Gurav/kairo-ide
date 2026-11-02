/**
 * Secret redaction utility to sanitize sensitive credentials from logs and transcripts.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_\-]{30,}/g,
  /sk-[a-zA-Z0-9]{40,}/g,
  /Bearer\s+[a-zA-Z0-9\._\-]+/gi,
  /approval[_-]?token[=:\s]+[a-zA-Z0-9_\-]+/gi,
  /(?:api[_-]?key|secret|password|access[_-]?token)["':\s=]+[a-zA-Z0-9_\-]+/gi,
];

export function redactSecrets(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }

  let sanitized = input;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (matched) => {
      const parts = matched.split(/[=:\s]+/);
      if (parts.length > 1) {
        return `${parts[0]}=[REDACTED_SECRET]`;
      }
      return "[REDACTED_SECRET]";
    });
  }
  return sanitized;
}

export const redactString = redactSecrets;

export function redactObject<T>(input: T): T {
  if (!input) return input;
  if (typeof input === "string") {
    return redactSecrets(input) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item)) as unknown as T;
  }
  if (typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (/password|secret|key|token|auth/i.test(key) && typeof val === "string") {
        output[key] = "[REDACTED_SECRET]";
      } else {
        output[key] = redactObject(val);
      }
    }
    return output as T;
  }
  return input;
}
