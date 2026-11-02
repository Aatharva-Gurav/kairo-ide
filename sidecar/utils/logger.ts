import { redactSecrets } from "./redaction";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private levelPriority: number;

  constructor(
    private readonly component: string = "sidecar",
    level: LogLevel = "info"
  ) {
    this.levelPriority = LOG_LEVEL_PRIORITY[level] ?? 20;
  }

  public setLevel(level: LogLevel): void {
    this.levelPriority = LOG_LEVEL_PRIORITY[level] ?? 20;
  }

  public child(childComponent: string): Logger {
    const child = new Logger(`${this.component}:${childComponent}`);
    child.levelPriority = this.levelPriority;
    return child;
  }

  private format(level: LogLevel, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const cleanMessage = redactSecrets(message);
    const metaStr =
      meta !== undefined
        ? ` ${redactSecrets(typeof meta === "string" ? meta : JSON.stringify(meta))}`
        : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${this.component}] ${cleanMessage}${metaStr}`;
  }

  public debug(message: string, meta?: unknown): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITY.debug) {
      console.debug(this.format("debug", message, meta));
    }
  }

  public info(message: string, meta?: unknown): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITY.info) {
      console.info(this.format("info", message, meta));
    }
  }

  public warn(message: string, meta?: unknown): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITY.warn) {
      console.warn(this.format("warn", message, meta));
    }
  }

  public error(message: string, meta?: unknown): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITY.error) {
      console.error(this.format("error", message, meta));
    }
  }
}

export const logger = new Logger("sidecar");
