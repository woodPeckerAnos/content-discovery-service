/**
 * 环境变量与路径解析。
 *
 * 浏览器 Profile 默认在 profiles/<platform>/，由 StagehandDriver 持久化 Cookie；
 * 未配置 DATABASE_URL 时结果落盘到 RESULTS_DIR，不连 PostgreSQL。
 */
import "dotenv/config";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const envSchema = z.object({
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY 不能为空"),
  LLM_MODEL: z.string().default("deepseek/deepseek-chat"),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  HEADLESS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BROWSER_PROFILE_DIR: z.string().default("profiles/douyin"),
  BROWSER_CHANNEL: z.string().default("chrome"),
  MIN_RESULT_RATIO: z.coerce.number().min(0).max(1).default(0.9),
  MAX_SCROLLS: z.coerce.number().int().positive().default(15),
  SCROLL_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  JOBS_FILE: z.string().default("config/jobs.example.json"),
  QUEUE_JOBS_CONFIG_PATH: z.string().default("config/queue-jobs.yaml"),
  SEARCH_PROFILES_PATH: z.string().default("config/search-profiles.yaml"),
  RESULTS_DIR: z.string().default("results"),
  SERVER_PORT: z.coerce.number().int().positive().default(3200),
  API_TOKEN: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
});

export type AppConfig = z.infer<typeof envSchema> & {
  projectRoot: string;
  browserProfilePath: string;
  resultsPath: string;
  jobsPath: string;
  queueJobsPath: string;
  searchProfilesPath: string;
  cacheDir: string;
};

function resolveFromRoot(relativePath: string): string {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(projectRoot, relativePath);
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  return {
    ...parsed,
    projectRoot,
    browserProfilePath: resolveFromRoot(parsed.BROWSER_PROFILE_DIR),
    resultsPath: resolveFromRoot(parsed.RESULTS_DIR),
    jobsPath: resolveFromRoot(parsed.JOBS_FILE),
    queueJobsPath: resolveFromRoot(parsed.QUEUE_JOBS_CONFIG_PATH),
    searchProfilesPath: resolveFromRoot(parsed.SEARCH_PROFILES_PATH),
    cacheDir: path.join(projectRoot, ".stagehand-cache"),
  };
}

export function getProfilePathForPlatform(
  config: AppConfig,
  platform: string,
): string {
  const base =
    config.BROWSER_PROFILE_DIR.includes(platform)
      ? config.browserProfilePath
      : path.join(projectRoot, "profiles", platform);
  return path.resolve(base);
}
