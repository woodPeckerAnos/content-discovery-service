import { z } from "zod";
import type { Platform } from "../types/content.js";
import type { SearchRequest } from "../types/search.js";
import { PLATFORMS } from "../types/search.js";

const platformSchema = z.enum(PLATFORMS as [Platform, ...Platform[]]);

export const searchRequestBodySchema = z.object({
  platform: platformSchema.default("douyin"),
  mode: z.literal("keyword").default("keyword"),
  keyword: z.string().min(1),
  filters: z.record(z.unknown()).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const batchSearchBodySchema = z.object({
  searches: z.array(searchRequestBodySchema).min(1),
});

export type SearchRequestBody = z.infer<typeof searchRequestBodySchema>;
export type BatchSearchBody = z.infer<typeof batchSearchBodySchema>;

export function parseSearchRequestBody(body: unknown): SearchRequest {
  return searchRequestBodySchema.parse(body) as SearchRequest;
}

export function parseBatchSearchBody(body: unknown): SearchRequest[] {
  const parsed = batchSearchBodySchema.parse(body);
  return parsed.searches as SearchRequest[];
}

export function parseSearchJobPayload(
  payload: Record<string, unknown>,
): SearchRequest | SearchRequest[] {
  if (payload.searches !== undefined && Array.isArray(payload.searches)) {
    return parseBatchSearchBody(payload);
  }
  return parseSearchRequestBody(payload);
}

export function buildSearchRequestFromCliArgs(
  args: Record<string, string | boolean>,
): SearchRequest {
  const platform = String(args.platform ?? "douyin") as Platform;
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const limit = Number(args.limit ?? 50);
  const keyword = args.keyword ? String(args.keyword) : undefined;

  const filters: Record<string, unknown> = {};
  if (args["content-type"]) filters.contentType = String(args["content-type"]);
  if (args["sort-by"]) filters.sortBy = String(args["sort-by"]);
  if (args["publish-time"]) filters.publishTime = String(args["publish-time"]);

  return {
    platform,
    mode: "keyword",
    keyword,
    filters: Object.keys(filters).length ? filters : undefined,
    limit,
  };
}
