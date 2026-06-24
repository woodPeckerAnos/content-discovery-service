import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../../config.js";

export interface DouyinPlatformConfig {
  searchUrlTemplate: string;
  canonicalUrlTemplate: string;
  network: { urlPatterns: string[] };
  filters: {
    contentType: Record<string, string>;
    sortBy: Record<string, string>;
    publishTime: Record<string, string>;
  };
  defaults: {
    contentType: string;
    sortBy: string;
    publishTime: string;
  };
}

let cachedConfig: DouyinPlatformConfig | null = null;

export async function loadDouyinConfig(): Promise<DouyinPlatformConfig> {
  if (cachedConfig) return cachedConfig;
  const config = loadConfig();
  const yamlPath = path.join(
    config.projectRoot,
    "config/platforms/douyin.yaml",
  );
  const raw = await fs.readFile(yamlPath, "utf-8");
  cachedConfig = parseYaml(raw) as DouyinPlatformConfig;
  return cachedConfig;
}

export interface ResolvedDouyinFilters {
  contentTypeLabel: string;
  sortByLabel: string;
  publishTimeLabel: string;
}

export async function resolveDouyinFilters(
  filters?: Record<string, unknown>,
): Promise<ResolvedDouyinFilters> {
  const cfg = await loadDouyinConfig();
  const contentTypeKey = String(
    filters?.contentType ?? cfg.defaults.contentType,
  );
  const sortByKey = String(filters?.sortBy ?? cfg.defaults.sortBy);
  const publishTimeKey = String(
    filters?.publishTime ?? cfg.defaults.publishTime,
  );

  return {
    contentTypeLabel:
      cfg.filters.contentType[contentTypeKey] ?? contentTypeKey,
    sortByLabel: cfg.filters.sortBy[sortByKey] ?? sortByKey,
    publishTimeLabel:
      cfg.filters.publishTime[publishTimeKey] ?? publishTimeKey,
  };
}

export function buildDouyinSearchUrl(
  cfg: DouyinPlatformConfig,
  keyword: string,
): string {
  return cfg.searchUrlTemplate.replace(
    "{keyword}",
    encodeURIComponent(keyword),
  );
}

export function buildDouyinCanonicalUrl(
  cfg: DouyinPlatformConfig,
  platformId: string,
): string {
  return cfg.canonicalUrlTemplate.replace("{platformId}", platformId);
}

export function matchesDouyinNetworkUrl(
  cfg: DouyinPlatformConfig,
  url: string,
): boolean {
  if (cfg.network.urlPatterns.some((pattern) => url.includes(pattern))) {
    return true;
  }
  return /aweme\/v\d+\/web\/.+search/i.test(url);
}
