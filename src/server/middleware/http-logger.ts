import type { Context, Next } from "koa";
import { log } from "../../utils/logger.js";

export async function httpLogger(ctx: Context, next: Next): Promise<void> {
  const started = Date.now();
  const requestId =
    typeof ctx.request.headers["x-request-id"] === "string"
      ? ctx.request.headers["x-request-id"]
      : undefined;
  const traceId =
    typeof ctx.request.headers["x-trace-id"] === "string"
      ? ctx.request.headers["x-trace-id"]
      : undefined;

  try {
    await next();
  } finally {
    if (ctx.path === "/health") {
      return;
    }

    log.info("HTTP request", {
      trace_id: traceId,
      request_id: requestId,
      http: {
        method: ctx.method,
        path: ctx.path,
        status: ctx.status,
        duration_ms: Date.now() - started,
        client_ip: ctx.ip,
        user_agent: ctx.get("user-agent") || undefined,
      },
    });
  }
}
