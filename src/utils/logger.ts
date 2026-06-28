import type {
  LogEntry,
  LogEnv,
  LogErrorDetail,
  LogFields,
  LogLevel,
} from "../types/log-entry.js";

const SERVICE_NAME =
  process.env.SERVICE_NAME?.trim() || "content-discovery";
const SERVICE_VERSION =
  process.env.SERVICE_VERSION?.trim() ||
  process.env.npm_package_version ||
  "1.0.0";
const LOG_SINK_ENABLED =
  (process.env.LOG_SINK_ENABLED ?? "true").toLowerCase() !== "false";
const LOG_SINK_URL =
  process.env.LOG_SINK_URL?.trim() || "http://127.0.0.1:8088/";
const LOG_LEVEL = parseLogLevel(process.env.LOG_LEVEL);

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "fatal"
  ) {
    return normalized;
  }
  return "info";
}

function resolveEnv(): LogEnv {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === "production") {
    return "production";
  }
  if (nodeEnv === "test") {
    return "test";
  }
  return "development";
}

function levelRank(level: LogLevel): number {
  switch (level) {
    case "debug":
      return 10;
    case "info":
      return 20;
    case "warn":
      return 30;
    case "error":
      return 40;
    case "fatal":
      return 50;
  }
}

function shouldLog(level: LogLevel): boolean {
  return levelRank(level) >= levelRank(LOG_LEVEL);
}

function normalizeError(error: unknown): LogErrorDetail {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message,
      stack: error.stack,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    "message" in error
  ) {
    const record = error as LogErrorDetail;
    return {
      type: record.type,
      message: record.message,
      stack: record.stack,
      code: record.code,
    };
  }

  return {
    type: "Error",
    message: String(error),
  };
}

export function buildLogEntry(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    env: resolveEnv(),
    version: SERVICE_VERSION,
  };

  if (fields.trace_id) entry.trace_id = fields.trace_id;
  if (fields.span_id) entry.span_id = fields.span_id;
  if (fields.job_id) entry.job_id = fields.job_id;
  if (fields.job_name) entry.job_name = fields.job_name;
  if (fields.request_id) entry.request_id = fields.request_id;
  if (fields.http) entry.http = fields.http;
  if (fields.duration_ms !== undefined) entry.duration_ms = fields.duration_ms;
  if (fields.context && Object.keys(fields.context).length > 0) {
    entry.context = fields.context;
  }

  if (level === "error" || level === "fatal") {
    entry.error = normalizeError(fields.error ?? new Error(message));
  }

  return entry;
}

function writeToConsole(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "fatal") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function shipToLogSink(entry: LogEntry): void {
  if (!LOG_SINK_ENABLED) {
    return;
  }

  void fetch(LOG_SINK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Vector 未启动时不影响业务；stdout 仍保留完整 JSON
  });
}

export function emitLog(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry = buildLogEntry(level, message, fields);
  writeToConsole(entry);
  shipToLogSink(entry);
}

export function log(
  level: LogLevel,
  message: string,
  fields?: LogFields,
): void {
  emitLog(level, message, fields);
}

log.debug = (message: string, fields?: LogFields) =>
  emitLog("debug", message, fields);
log.info = (message: string, fields?: LogFields) =>
  emitLog("info", message, fields);
log.warn = (message: string, fields?: LogFields) =>
  emitLog("warn", message, fields);
log.error = (message: string, fields?: LogFields) =>
  emitLog("error", message, fields);
log.fatal = (message: string, fields?: LogFields) =>
  emitLog("fatal", message, fields);

/** job-queue Worker onLog 回调 */
export function logFromJobQueue(
  level: "info" | "warn" | "error" | "debug" | "fatal",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const mapped =
    level === "debug" ? "debug" : level === "fatal" ? "fatal" : level;
  emitLog(mapped, message, { context: meta });
}
