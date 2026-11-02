import { describe, it, expect } from "vitest";
import path from "node:path";
import { redactSecrets } from "../utils/redaction";
import { Logger } from "../utils/logger";
import { validatePathInWorkspace } from "../workspace/validator";
import { SidecarError } from "../server/error";
import { ERROR_CODES } from "../../lib/ai-agent/protocol-constants";

describe("Sidecar Security & Lifecycle Utilities", () => {
  describe("Secret Redaction", () => {
    it("redacts Anthropic API keys", () => {
      const input = "Using key sk-ant-api03-abcdef123456789012345678901234567890-xyz to connect";
      const sanitized = redactSecrets(input);
      expect(sanitized).not.toContain("sk-ant-");
      expect(sanitized).toContain("[REDACTED_SECRET]");
    });

    it("redacts OpenAI API keys", () => {
      const input = "OpenAI key: sk-abcdefghijklmnopqrstuvwxyz12345678901234567890";
      const sanitized = redactSecrets(input);
      expect(sanitized).not.toContain("sk-abcdef");
      expect(sanitized).toContain("[REDACTED_SECRET]");
    });

    it("redacts Bearer tokens", () => {
      const input = "Authorization: Bearer my-very-secret-token-value-here";
      const sanitized = redactSecrets(input);
      expect(sanitized).not.toContain("my-very-secret");
      expect(sanitized).toContain("[REDACTED_SECRET]");
    });

    it("redacts approval tokens in query/flag formats", () => {
      const input = "ws://127.0.0.1:49152/transport?approval_token=super-secret-approval-token";
      const sanitized = redactSecrets(input);
      expect(sanitized).not.toContain("super-secret-approval-token");
      expect(sanitized).toContain("approval_token=[REDACTED_SECRET]");
    });

    it("preserves regular non-secret strings", () => {
      const input = "Reading file src/index.ts in workspace";
      expect(redactSecrets(input)).toBe(input);
    });
  });

  describe("Workspace Boundary Validator", () => {
    const mockRoot = path.resolve("/kairo/workspace");

    it("allows valid relative paths within workspace", () => {
      const result = validatePathInWorkspace("src/main.ts", mockRoot);
      expect(result).toBe(path.resolve(mockRoot, "src/main.ts"));
    });

    it("allows valid absolute paths within workspace", () => {
      const target = path.resolve(mockRoot, "components/button.tsx");
      const result = validatePathInWorkspace(target, mockRoot);
      expect(result).toBe(target);
    });

    it("throws SidecarError when path escapes workspace via parent navigation", () => {
      expect(() => validatePathInWorkspace("../outside.txt", mockRoot)).toThrow(SidecarError);

      try {
        validatePathInWorkspace("../../etc/passwd", mockRoot);
      } catch (err) {
        const sidecarErr = err as SidecarError;
        expect(sidecarErr.code).toBe(ERROR_CODES.ERR_UNAUTHORIZED);
        expect(sidecarErr.message).toContain("escapes workspace root");
      }
    });

    it("throws SidecarError when workspace root is empty", () => {
      expect(() => validatePathInWorkspace("file.txt", "")).toThrow(SidecarError);
    });
  });

  describe("Structured Logger", () => {
    it("instantiates child loggers with namespaced component names", () => {
      const parent = new Logger("sidecar", "info");
      const child = parent.child("transport");
      expect(child).toBeDefined();
    });
  });
});
