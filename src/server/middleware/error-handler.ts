import type { Context, Next } from "koa";
import { ZodError } from "zod";
import { log } from "../../utils/logger.js";

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export async function errorMiddleware(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (error) {
    if (error instanceof ZodError) {
      ctx.status = 400;
      ctx.body = { error: formatZodError(error) };
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    log.error("HTTP API error", { error: message });
    ctx.status = 500;
    ctx.body = { error: message };
  }
}
