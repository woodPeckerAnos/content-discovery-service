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
  MIN_RESULT_RATIO: z.coerce.number().min(0).max(1).default(0.9),
  MAX_SCROLLS: z.coerce.number().int().positive().default(15),
  SCROLL_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  CRON_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CRON_SCHEDULE: z.string().default("0 9,21 * * *"),
  JOBS_FILE: z.string().default("config/jobs.example.json"),
  RESULTS_DIR: z.string().default("results"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  projectRoot: string;
  browserProfilePath: string;
  resultsPath: string;
  jobsPath: string;
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
    cacheDir: path.join(projectRoot, ".stagehand-cache"),
  };
}

export function getProfilePathForPlatform(
  config: AppConfig,
  platform: string,
): string {
  if (config.BROWSER_PROFILE_DIR.includes(platform)) {
    return config.browserProfilePath;
  }
  return path.join(projectRoot, "profiles", platform);
}
