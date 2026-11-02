import { parseSidecarConfig, SidecarConfig } from "./config";
import { startSidecarServer, SidecarInstance } from "./server/server";
import { Logger } from "./utils/logger";

const logger = new Logger("sidecar:main");

export async function main(argv: string[] = process.argv): Promise<SidecarInstance> {
  let config: SidecarConfig;

  try {
    config = parseSidecarConfig(argv);
  } catch (err) {
    logger.error("Configuration validation failed during startup", err);
    process.exit(1);
  }

  logger.setLevel(config.logLevel);
  logger.info("Initializing Kairo AI Agent Sidecar foundation...", {
    port: config.port,
    workspace: config.workspace ?? "none",
    logLevel: config.logLevel,
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
  });

  let serverInstance: SidecarInstance;
  try {
    serverInstance = startSidecarServer(config, logger);
  } catch (err) {
    logger.error("Failed to start sidecar transport server", err);
    process.exit(1);
  }

  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
      await serverInstance.stop();
      logger.info("Clean shutdown complete. Exiting process.");
      process.exit(0);
    } catch (err) {
      logger.error("Error during sidecar shutdown", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  return serverInstance;
}

// Run main if this is the entry script
if (import.meta.main) {
  main().catch((err) => {
    logger.error("Unhandled fatal exception in sidecar main", err);
    process.exit(1);
  });
}

export { parseSidecarConfig, startSidecarServer };
