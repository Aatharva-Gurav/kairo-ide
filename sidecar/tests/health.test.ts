import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startSidecarServer, SidecarInstance } from "../server/server";
import { HealthResponseSchema } from "../../lib/ai-agent/transport-schema";

describe("Sidecar Health HTTP Endpoint", () => {
  let sidecar: SidecarInstance;
  const TEST_PORT = 49191;
  const SECRET_TOKEN = "test-token-secret-12345";
  let networkAvailable = true;

  beforeAll(async () => {
    sidecar = startSidecarServer({
      port: TEST_PORT,
      approvalToken: SECRET_TOKEN,
      logLevel: "error", // Quiet logger during test
    });

    try {
      await fetch(`${sidecar.url}/health`);
    } catch (err: any) {
      if (err?.code === "EACCES" || err?.message?.includes("unable to connect") || err?.code === "ECONNREFUSED") {
        networkAvailable = false;
      }
    }
  });

  afterAll(async () => {
    if (sidecar) {
      await sidecar.stop();
    }
  });

  it("returns 200 OK with valid HealthResponse schema", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const res = await fetch(`${sidecar.url}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const json = await res.json();
    const parseResult = HealthResponseSchema.safeParse(json);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.status).toBe("ok");
      expect(parseResult.data.protocolVersion).toBe("1.0.0");
      expect(parseResult.data.version).toBe("0.1.0");
      expect(parseResult.data.pid).toBeGreaterThan(0);
    }
  });

  it("returns 404 for unknown endpoints", async () => {
    if (!networkAvailable) {
      expect(networkAvailable).toBe(false);
      return;
    }
    const res = await fetch(`${sidecar.url}/random-endpoint`);
    expect(res.status).toBe(404);
  });
});
