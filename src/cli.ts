#!/usr/bin/env node
/** 本地调试入口：search / jobs / login（生产流量走 npm run server 或 worker）。 */
import fs from "node:fs/promises";
import { runInteractiveLogin } from "./commands/login.js";
import { initDatabase } from "./db/migrate.js";
import { buildSearchRequestFromCliArgs } from "./api/search-request.js";
import {
  executeSearch,
  executeSearchBatch,
} from "./services/search-executor.js";
import type { Platform } from "./types/content.js";
import type { SearchRequest } from "./types/search.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function cmdSearch(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const req = buildSearchRequestFromCliArgs(args);

  console.log(`开始搜索: ${req.platform} / ${req.keyword ?? "(无关键词)"}`);
  const result = await executeSearch(req);

  console.log(`完成: ${result.actualCount} 条, 耗时 ${result.durationMs}ms`);
  if (result.partial) {
    console.warn("警告: 结果为 partial（条数未达预期下限）");
  }
  if (result.warnings?.length) {
    for (const w of result.warnings) console.warn(`- ${w}`);
  }
  if (result.outputPath) {
    console.log(`结果已写入: ${result.outputPath}`);
  }
}

interface JobsFile {
  jobs: SearchRequest[];
}

async function cmdJobs(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const file = String(args.file ?? "config/jobs.example.json");
  const raw = await fs.readFile(file, "utf-8");
  const parsed = JSON.parse(raw) as JobsFile;

  if (!Array.isArray(parsed.jobs) || parsed.jobs.length === 0) {
    throw new Error(`jobs 文件无效: ${file}`);
  }

  console.log(`批量执行 ${parsed.jobs.length} 个任务...`);
  const results = await executeSearchBatch(parsed.jobs);

  for (let i = 0; i < results.length; i++) {
    const job = parsed.jobs[i];
    const result = results[i];
    console.log(
      `[${i + 1}/${results.length}] ${job.platform}/${job.keyword}: ${result.actualCount} 条 -> ${result.outputPath ?? "无输出"}`,
    );
  }
}

async function cmdLogin(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const platform = String(args.platform ?? "douyin") as Platform;
  await runInteractiveLogin(platform);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "search":
      await initDatabase();
      await cmdSearch(rest);
      break;
    case "jobs":
      await initDatabase();
      await cmdJobs(rest);
      break;
    case "login":
      await cmdLogin(rest);
      break;
    default:
      console.log(`用法:
  npm run server          # HTTP API（主服务入口）
  npm run worker          # Redis 队列 Worker
  npm run login -- --platform douyin
  npm run search -- --platform douyin --keyword "家常菜" --limit 50
  npm run jobs -- --file config/jobs.example.json

详见 README.md / docs/mq.md`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
