/** 从 config/queue-jobs.yaml（或 QUEUE_JOB_NAMES）注册本服务消费的 job 名称。 */
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { registerHandler } from "job-queue";
import { loadConfig } from "../config.js";
import { handleContentDiscoveryJob } from "./handlers.js";
import { log } from "../utils/logger.js";

const queueJobsSchema = z.object({
  job_names: z.array(z.string().min(1)).min(1),
});

export async function registerContentDiscoveryHandlers(): Promise<string[]> {
  const config = loadConfig();
  const fromEnv = process.env.QUEUE_JOB_NAMES?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  let jobNames = fromEnv;

  if (!jobNames?.length) {
    const raw = await readFile(config.queueJobsPath, "utf8");
    const parsed = queueJobsSchema.parse(parse(raw));
    jobNames = parsed.job_names;
  }

  for (const jobName of jobNames) {
    registerHandler(jobName, handleContentDiscoveryJob);
  }

  log.info("Registered queue handlers", {
    context: { jobNames },
  });
  return jobNames;
}
