import { SidecarConfig, SidecarConfigSchema } from "../schemas/config";
import { SidecarError, ERROR_CODES } from "../server/error";

export function parseSidecarConfig(argv: string[]): SidecarConfig {
  const args = argv.slice(2);
  let port: number | undefined;
  let approvalToken: string | undefined;
  let workspace: string | undefined;
  let logLevel: "debug" | "info" | "warn" | "error" = "info";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port") {
      const val = args[++i];
      port = val !== undefined ? Number.parseInt(val, 10) : undefined;
    } else if (arg.startsWith("--port=")) {
      port = Number.parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--approval-token") {
      approvalToken = args[++i];
    } else if (arg.startsWith("--approval-token=")) {
      approvalToken = arg.slice("--approval-token=".length);
    } else if (arg === "--workspace") {
      workspace = args[++i];
    } else if (arg.startsWith("--workspace=")) {
      workspace = arg.slice("--workspace=".length);
    } else if (arg === "--log-level") {
      const val = args[++i];
      if (
        val === "debug" ||
        val === "info" ||
        val === "warn" ||
        val === "error"
      ) {
        logLevel = val;
      }
    } else if (arg.startsWith("--log-level=")) {
      const val = arg.slice("--log-level=".length);
      if (
        val === "debug" ||
        val === "info" ||
        val === "warn" ||
        val === "error"
      ) {
        logLevel = val;
      }
    }
  }

  const parseResult = SidecarConfigSchema.safeParse({
    port,
    approvalToken,
    workspace,
    logLevel,
  });

  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new SidecarError(
      ERROR_CODES.ERR_INVALID_CONFIG,
      `Invalid sidecar configuration: ${errorDetails}`,
      parseResult.error.format()
    );
  }

  return parseResult.data;
}

export type { SidecarConfig };
