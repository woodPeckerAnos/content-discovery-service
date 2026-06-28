/**
 * Redis Streams 队列 Worker 入口（npm run worker）。
 *
 * 由 job-scheduler 投递 douyin_search 等任务；搜索完成后可向下游
 * comments-douyin / transcript 队列派发 pipeline 子任务（见 mq/dispatch.ts）。
 * WORKER_CONCURRENCY 建议为 1，避免多任务争抢同一浏览器 Profile。
 */
import { createWorker } from "job-queue";
import { registerContentDiscoveryHandlers } from "./mq/register.js";
import { log, logFromJobQueue } from "./utils/logger.js";

async function main(): Promise<void> {
  const jobNames = await registerContentDiscoveryHandlers();

  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);
  if (concurrency > 1) {
    log.warn(
      "WORKER_CONCURRENCY > 1：多个搜索会争抢同一浏览器 Profile，建议设为 1",
      { context: { concurrency } },
    );
  }

  const worker = createWorker({
    queueName: process.env.QUEUE_NAME ?? "search",
    concurrency,
    consumerName: process.env.WORKER_NAME ?? "content-discovery",
    onLog: logFromJobQueue,
  });

  const shutdown = (signal: string) => {
    log.info("Shutting down worker", {
      context: { signal, jobNames },
    });
    worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log.info("Content discovery worker starting", {
    context: {
      queue: process.env.QUEUE_NAME ?? "search",
      redis: `${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? 6379}`,
      concurrency,
      jobNames,
    },
  });

  await worker.start();
}

main().catch((error) => {
  log.error("Worker failed to start", { error });
  process.exit(1);
});
