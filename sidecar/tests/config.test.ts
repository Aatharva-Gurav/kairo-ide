import { describe, it, expect } from "vitest";
import { parseSidecarConfig } from "../config";
import { SidecarError } from "../server/error";
import { ERROR_CODES } from "../../lib/ai-agent/protocol-constants";

describe("Sidecar Configuration Parser", () => {
  it("parses valid space-separated arguments", () => {
    const argv = [
      "bun",
      "sidecar/index.ts",
      "--port",
      "49152",
      "--approval-token",
      "secret-token-12345",
      "--workspace",
      "/my/workspace",
      "--log-level",
      "debug",
    ];

    const config = parseSidecarConfig(argv);
    expect(config.port).toBe(49152);
    expect(config.approvalToken).toBe("secret-token-12345");
    expect(config.workspace).toBe("/my/workspace");
    expect(config.logLevel).toBe("debug");
  });

  it("parses valid equal-separated arguments", () => {
    const argv = [
      "bun",
      "sidecar/index.ts",
      "--port=49153",
      "--approval-token=secret-token-54321",
      "--log-level=warn",
    ];

    const config = parseSidecarConfig(argv);
    expect(config.port).toBe(49153);
    expect(config.approvalToken).toBe("secret-token-54321");
    expect(config.logLevel).toBe("warn");
  });

  it("fails when --port is missing", () => {
    const argv = [
      "bun",
      "sidecar/index.ts",
      "--approval-token",
      "secret-token-12345",
    ];

    expect(() => parseSidecarConfig(argv)).toThrow(SidecarError);
    try {
      parseSidecarConfig(argv);
    } catch (err) {
      const sidecarErr = err as SidecarError;
      expect(sidecarErr.code).toBe(ERROR_CODES.ERR_INVALID_CONFIG);
      expect(sidecarErr.message).toContain("port");
    }
  });

  it("fails when --approval-token is missing", () => {
    const argv = ["bun", "sidecar/index.ts", "--port", "49152"];

    expect(() => parseSidecarConfig(argv)).toThrow(SidecarError);
  });

  it("fails when port is out of valid range", () => {
    const argvLow = [
      "bun",
      "sidecar/index.ts",
      "--port",
      "-1",
      "--approval-token",
      "secret-token-12345",
    ];
    expect(() => parseSidecarConfig(argvLow)).toThrow(SidecarError);

    const argvHigh = [
      "bun",
      "sidecar/index.ts",
      "--port",
      "70000",
      "--approval-token",
      "secret-token-12345",
    ];
    expect(() => parseSidecarConfig(argvHigh)).toThrow(SidecarError);
  });

  it("fails when approval token is shorter than 8 characters", () => {
    const argv = [
      "bun",
      "sidecar/index.ts",
      "--port",
      "49152",
      "--approval-token",
      "short",
    ];

    expect(() => parseSidecarConfig(argv)).toThrow(SidecarError);
  });
});
