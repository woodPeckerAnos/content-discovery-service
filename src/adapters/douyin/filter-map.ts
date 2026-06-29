/**
 * 抖音平台配置与筛选映射（config/platforms/douyin.yaml）。
 *
 * applyPlatformSearchDefaults 在请求未显式传 filters 时注入 defaults（如最多点赞、一周内）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../../config.js";

import type { SearchRequest } from "../../types/search.js";

export interface DouyinPlatformConfig {
  searchUrlTemplate: string;
  canonicalUrlTemplate: string;
  network: { urlPatterns: string[] };
  /** PC 搜索页 DOM 筛选索引（span[data-key] / data-index1|2） */
  domFilterIndices?: {
    contentTypeTab: Record<string, string>;
    sortBy: Record<string, { index1: number; index2: number }>;
    publishTime: Record<string, { index1: number; index2: number }>;
  };
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

export async function applyPlatformSearchDefaults(
  req: SearchRequest,
): Promise<SearchRequest> {
  if (req.platform !== "douyin") return req;

  const cfg = await loadDouyinConfig();
  return {
    ...req,
    filters: {
      contentType: req.filters?.contentType ?? cfg.defaults.contentType,
      sortBy: req.filters?.sortBy ?? cfg.defaults.sortBy,
      publishTime: req.filters?.publishTime ?? cfg.defaults.publishTime,
    },
  };
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

export interface DouyinFilterDomSelection {
  contentTypeTab?: string;
  sort?: { index1: number; index2: number; label: string };
  publish?: { index1: number; index2: number; label: string };
}

export function resolveDouyinFilterDomSelection(
  cfg: DouyinPlatformConfig,
  filters?: Record<string, unknown>,
): DouyinFilterDomSelection {
  const dom = cfg.domFilterIndices;
  if (!dom) {
    return {};
  }

  const contentTypeKey = String(
    filters?.contentType ?? cfg.defaults.contentType,
  );
  const sortByKey = String(filters?.sortBy ?? cfg.defaults.sortBy);
  const publishTimeKey = String(
    filters?.publishTime ?? cfg.defaults.publishTime,
  );

  const sortIndices = dom.sortBy[sortByKey];
  const publishIndices = dom.publishTime[publishTimeKey];

  return {
    contentTypeTab: dom.contentTypeTab[contentTypeKey],
    sort: sortIndices
      ? {
          ...sortIndices,
          label: cfg.filters.sortBy[sortByKey] ?? sortByKey,
        }
      : undefined,
    publish: publishIndices
      ? {
          ...publishIndices,
          label: cfg.filters.publishTime[publishTimeKey] ?? publishTimeKey,
        }
      : undefined,
  };
}

export function buildDouyinSearchUrl(
  cfg: DouyinPlatformConfig,
  keyword: string,
  _filters?: Record<string, unknown>,
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

/** 综合 Tab 搜索 API；视频 Tab 采集阶段应忽略，避免与 general 结果混并 */
export function isGeneralTabSearchNetworkUrl(url: string): boolean {
  return (
    url.includes("/aweme/v1/web/general/search") ||
    url.includes("/aweme/v1/general/search")
  );
}

/** 视频 Tab 主列表 API；其 aweme_list 顺序可作为 DOM 不可用时的兜底 */
export function isVideoTabSearchNetworkUrl(url: string): boolean {
  return url.includes("/aweme/v1/web/search/item");
}
