/** 命名搜索配置（config/search-profiles.yaml），供 MQ runLabel 与定时任务复用。 */
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import { searchRequestBodySchema } from "../api/search-request.js";
import { loadConfig } from "../config.js";
import type { SearchRequest } from "../types/search.js";

const profilesFileSchema = z.object({
  profiles: z.record(z.string().min(1), searchRequestBodySchema),
});

let cachedProfiles: Map<string, SearchRequest> | null = null;

export async function loadSearchProfiles(): Promise<Map<string, SearchRequest>> {
  if (cachedProfiles) {
    return cachedProfiles;
  }

  const config = loadConfig();
  const raw = await readFile(config.searchProfilesPath, "utf8");
  const parsed = profilesFileSchema.parse(parse(raw));

  cachedProfiles = new Map(
    Object.entries(parsed.profiles).map(([label, profile]) => [
      label,
      profile as SearchRequest,
    ]),
  );

  return cachedProfiles;
}

export async function resolveSearchProfile(
  runLabel: string,
): Promise<SearchRequest> {
  const profiles = await loadSearchProfiles();
  const profile = profiles.get(runLabel);
  if (!profile) {
    throw new Error(
      `Unknown search profile runLabel=${runLabel} (check config/search-profiles.yaml)`,
    );
  }
  return profile;
}

export function buildSearchBatchId(triggeredAt: string): string {
  // UTC 紧凑时间戳，作为 pipeline 子任务的 searchBatchId 关联键
  const date = new Date(triggeredAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid triggeredAt for searchBatchId: ${triggeredAt}`);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`
  );
}
