import Koa from "koa";
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import { initDatabase } from "../db/migrate.js";
import { loadConfig } from "../config.js";
import { authMiddleware } from "./auth.js";
import { errorMiddleware } from "./middleware/error-handler.js";
import { createSearchRouter } from "./routes/search.js";
import { searchExecutor } from "../services/search-executor.js";
import { log } from "../utils/logger.js";

export async function createApp(): Promise<Koa> {
  await initDatabase();

  const app = new Koa();

  app.use(errorMiddleware);
  app.use(bodyParser({ jsonLimit: "1mb", encoding: "utf-8" }));
  app.use(authMiddleware);

  const rootRouter = new Router();
  rootRouter.get("/health", (ctx) => {
    ctx.body = {
      status: "ok",
      service: "content-discovery-service",
      executor: searchExecutor.stats,
    };
  });

  const searchRouter = createSearchRouter();
  app
    .use(rootRouter.routes())
    .use(rootRouter.allowedMethods())
    .use(searchRouter.routes())
    .use(searchRouter.allowedMethods());

  return app;
}

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const app = await createApp();

  const server = app.listen(config.SERVER_PORT, () => {
    log.info("Content discovery server listening", {
      port: config.SERVER_PORT,
      auth: Boolean(config.API_TOKEN),
      framework: "koa",
    });
  });

  const shutdown = (signal: string) => {
    log.info("Shutting down server", { signal });
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
