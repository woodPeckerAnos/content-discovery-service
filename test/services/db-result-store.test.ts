import { describe, expect, it } from "vitest";
import { buildPlatformContentParams } from "../../src/services/db-result-store.js";
import type { UnifiedContentItem } from "../../src/types/content.js";

describe("buildPlatformContentParams", () => {
  const sample: UnifiedContentItem = {
    platform: "douyin",
    contentType: "video",
    rank: 1,
    title: "测试标题",
    shareUrl: "https://v.douyin.com/abc",
    canonicalUrl: "https://www.douyin.com/video/123",
    platformId: "123",
    author: { id: "u1", name: "作者" },
    metrics: { likes: 100, views: 1000, comments: 10 },
    publishedAt: "2026-06-01T00:00:00.000Z",
    fetchedAt: "2026-06-27T00:00:00.000Z",
  };

  it("maps unified item fields to upsert parameter order", () => {
    expect(buildPlatformContentParams(sample)).toEqual([
      "douyin",
      "123",
      "video",
      "测试标题",
      "https://v.douyin.com/abc",
      "https://www.douyin.com/video/123",
      "u1",
      "作者",
      100,
      1000,
      10,
      new Date("2026-06-01T00:00:00.000Z"),
    ]);
  });

  it("uses null for optional fields", () => {
    const minimal: UnifiedContentItem = {
      platform: "douyin",
      contentType: "video",
      rank: 1,
      title: "t",
      shareUrl: "https://v.douyin.com/x",
      platformId: "999",
      fetchedAt: "2026-06-27T00:00:00.000Z",
    };

    expect(buildPlatformContentParams(minimal)).toEqual([
      "douyin",
      "999",
      "video",
      "t",
      "https://v.douyin.com/x",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
