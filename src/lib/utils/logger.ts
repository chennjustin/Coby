type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private static formatMessage(entry: LogEntry): string {
    const { level, message, timestamp, metadata } = entry;
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  static info(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "info",
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
    console.log(this.formatMessage(entry));
  }

  static warn(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "warn",
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
    console.warn(this.formatMessage(entry));
  }

  static error(message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "error",
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
    console.error(this.formatMessage(entry));
  }

  static debug(message: string, metadata?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "development") {
      const entry: LogEntry = {
        level: "debug",
        message,
        timestamp: new Date().toISOString(),
        metadata,
      };
      console.debug(this.formatMessage(entry));
    }
  }
}

