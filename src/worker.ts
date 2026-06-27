import { createWorker } from "job-queue";
import { registerContentDiscoveryHandlers } from "./mq/register.js";
import { log } from "./utils/logger.js";

async function main(): Promise<void> {
  const jobNames = await registerContentDiscoveryHandlers();

  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);
  if (concurrency > 1) {
    log.warn(
      "WORKER_CONCURRENCY > 1：多个搜索会争抢同一浏览器 Profile，建议设为 1",
      { concurrency },
    );
  }

  const worker = createWorker({
    concurrency,
    consumerName: process.env.WORKER_NAME ?? "content-discovery",
    onLog: (level, message, meta) => log(level, message, meta),
  });

  const shutdown = (signal: string) => {
    log.info("Shutting down worker", { signal, jobNames });
    worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log.info("Content discovery worker starting", {
    queue: process.env.QUEUE_NAME ?? "jobs",
    redis: `${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? 6379}`,
    concurrency,
    jobNames,
  });

  await worker.start();
}

main().catch((error) => {
  log.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
