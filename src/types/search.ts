import type { Platform, SearchMode } from "./content.js";

export interface SearchRequest {
  platform: Platform;
  mode: SearchMode;
  keyword?: string;
  filters?: Record<string, unknown>;
  limit: number;
}

export interface TrendingRequest {
  platform: Platform;
  mode: "trending";
  category?: string;
  filters?: Record<string, unknown>;
  limit: number;
}

export interface SearchResult {
  success: boolean;
  partial?: boolean;
  items: import("./content.js").UnifiedContentItem[];
  actualCount: number;
  durationMs: number;
  warnings?: string[];
  outputPath?: string;
}

export const PLATFORMS: Platform[] = [
  "douyin",
  "xiaohongshu",
  "kuaishou",
  "x",
  "weibo",
];

export function validateSearchRequest(req: SearchRequest): void {
  if (req.mode === "keyword" && !req.keyword?.trim()) {
    throw new Error("关键词搜索需要提供 keyword");
  }
  if (req.limit < 1 || req.limit > 100) {
    throw new Error("limit 必须在 1–100 之间");
  }
}
