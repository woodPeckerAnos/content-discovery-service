export type Platform = "douyin" | "xiaohongshu" | "kuaishou" | "x" | "weibo";

export type ContentType = "video" | "image_text" | "article" | "thread";

export type SearchMode = "keyword" | "trending";

export interface UnifiedContentItem {
  platform: Platform;
  contentType: ContentType;
  rank: number;
  title: string;
  shareUrl: string;
  canonicalUrl?: string;
  platformId: string;
  author?: { id?: string; name?: string };
  metrics?: { likes?: number; views?: number; comments?: number };
  publishedAt?: string;
  fetchedAt: string;
}

export interface SearchResultPayload {
  request: import("./search.js").SearchRequest;
  success: boolean;
  partial?: boolean;
  actualCount: number;
  durationMs: number;
  items: UnifiedContentItem[];
  warnings?: string[];
}
