import { describe, expect, it } from "vitest";
import {
  applyPlatformSearchDefaults,
  buildDouyinSearchUrl,
  isGeneralTabSearchNetworkUrl,
  loadDouyinConfig,
  resolveDouyinFilterDomSelection,
} from "../../../src/adapters/douyin/filter-map.js";

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

describe("buildDouyinSearchUrl", () => {
  it("encodes keyword only (filters applied via DOM, not query)", async () => {
    const cfg = await loadDouyinConfig();
    const url = buildDouyinSearchUrl(cfg, "水晶", {
      contentType: "video",
      sortBy: "最多点赞",
      publishTime: "一周内",
    });

    expect(url).toBe("https://www.douyin.com/search/%E6%B0%B4%E6%99%B6");
  });
});

describe("isGeneralTabSearchNetworkUrl", () => {
  it("detects general tab search API paths", () => {
    expect(
      isGeneralTabSearchNetworkUrl(
        "https://www.douyin.com/aweme/v1/web/general/search/single/",
      ),
    ).toBe(true);
    expect(
      isGeneralTabSearchNetworkUrl(
        "https://www.douyin.com/aweme/v1/web/search/item/",
      ),
    ).toBe(false);
  });
});

describe("resolveDouyinFilterDomSelection", () => {
  it("maps defaults to video tab and filter indices", async () => {
    const cfg = await loadDouyinConfig();
    const sel = resolveDouyinFilterDomSelection(cfg, {
      contentType: "video",
      sortBy: "最多点赞",
      publishTime: "一周内",
    });

    expect(sel).toEqual({
      contentTypeTab: "video",
      sort: { index1: 0, index2: 2, label: "最多点赞" },
      publish: { index1: 1, index2: 2, label: "一周内" },
    });
  });
});
