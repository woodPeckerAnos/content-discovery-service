import { describe, expect, it } from "vitest";
import { applyPlatformSearchDefaults } from "../../../src/adapters/douyin/filter-map.js";

describe("applyPlatformSearchDefaults", () => {
  it("applies douyin video search defaults", async () => {
    const req = await applyPlatformSearchDefaults({
      platform: "douyin",
      mode: "keyword",
      keyword: "水晶",
      limit: 10,
    });

    expect(req.filters).toEqual({
      contentType: "video",
      sortBy: "最多点赞",
      publishTime: "一周内",
    });
  });

  it("preserves explicit filter overrides", async () => {
    const req = await applyPlatformSearchDefaults({
      platform: "douyin",
      mode: "keyword",
      keyword: "水晶",
      limit: 10,
      filters: { sortBy: "最新" },
    });

    expect(req.filters?.sortBy).toBe("最新");
    expect(req.filters?.publishTime).toBe("一周内");
  });

  it("does not modify other platforms", async () => {
    const req = await applyPlatformSearchDefaults({
      platform: "x",
      mode: "keyword",
      keyword: "test",
      limit: 10,
    });

    expect(req.filters).toBeUndefined();
  });
});
