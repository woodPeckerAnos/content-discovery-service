import type { Context, Next } from "koa";
import { loadConfig } from "../config.js";

export async function authMiddleware(ctx: Context, next: Next): Promise<void> {
  const config = loadConfig();
  if (!config.API_TOKEN) {
    await next();
    return;
  }

  const header = ctx.get("authorization");
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : ctx.get("x-api-token");

  if (token !== config.API_TOKEN) {
    ctx.status = 401;
    ctx.body = { error: "Unauthorized" };
    return;
  }

  await next();
}
