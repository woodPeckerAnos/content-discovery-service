import fs from "node:fs/promises";
import cron from "node-cron";
import { loadConfig } from "../config.js";
import { runSearchBatch } from "../services/search-service.js";
import type { SearchRequest } from "../types/search.js";

interface JobsFile {
  jobs: SearchRequest[];
}

async function loadJobs(): Promise<SearchRequest[]> {
  const config = loadConfig();
  const raw = await fs.readFile(config.jobsPath, "utf-8");
  const parsed = JSON.parse(raw) as JobsFile;
  return parsed.jobs;
}

async function runScheduledJobs(): Promise<void> {
  console.log(`[scheduler] ${new Date().toISOString()} 开始执行 jobs`);
  const jobs = await loadJobs();
  const results = await runSearchBatch(jobs);
  console.log(
    `[scheduler] 完成 ${results.length} 个任务, 成功 ${results.filter((r) => r.success).length} 个`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.CRON_ENABLED) {
    console.log("CRON_ENABLED=false，执行一次后退出");
    await runScheduledJobs();
    return;
  }

  if (!cron.validate(config.CRON_SCHEDULE)) {
    throw new Error(`无效的 CRON_SCHEDULE: ${config.CRON_SCHEDULE}`);
  }

  console.log(`Scheduler 已启动: ${config.CRON_SCHEDULE}`);
  console.log(`Jobs 文件: ${config.jobsPath}`);

  cron.schedule(config.CRON_SCHEDULE, () => {
    runScheduledJobs().catch((err) => {
      console.error("[scheduler] 执行失败:", err);
    });
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
