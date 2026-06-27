export function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const entry = {
    time: new Date().toISOString(),
    service: "content-discovery-service",
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

log.info = (message: string, meta?: Record<string, unknown>) =>
  log("info", message, meta);
log.warn = (message: string, meta?: Record<string, unknown>) =>
  log("warn", message, meta);
log.error = (message: string, meta?: Record<string, unknown>) =>
  log("error", message, meta);
