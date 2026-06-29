import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mergeNetworkOrder,
  parseAwemeIdsFromText,
  parseDouyinSearchResponse,
  parseDouyinSearchResponseOrdered,
  parseDouyinSearchResponseText,
} from "../../src/adapters/douyin/network-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("parseDouyinSearchResponse", () => {
  it("extracts aweme items from search API payload", () => {
    const fixturePath = path.join(
      __dirname,
      "../fixtures/douyin-search-response.json",
    );
    const body = JSON.parse(readFileSync(fixturePath, "utf-8"));

    const items = parseDouyinSearchResponse(body);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      platformId: "7123456789012345678",
      title: "紫水晶入门指南 #水晶 #能量水晶",
      author: { name: "水晶博主" },
      metrics: { likes: 12000, comments: 300, views: 500000 },
    });
    expect(items[1].platformId).toBe("7987654321098765432");
    expect(items[1].title).toBe("#白水晶 #净化");
  });

  it("parses string aweme_id", () => {
    const body = {
      aweme_list: [
        {
          aweme_id: "7123456789012345678",
          desc: "string id test",
        },
      ],
    };

    const items = parseDouyinSearchResponse(body);
    expect(items).toHaveLength(1);
    expect(items[0].platformId).toBe("7123456789012345678");
  });

  it("parses safe numeric aweme_id", () => {
    const body = {
      aweme_list: [
        {
          aweme_id: 7234567890123,
          desc: "safe numeric id",
        },
      ],
    };

    const items = parseDouyinSearchResponse(body);
    expect(items).toHaveLength(1);
    expect(items[0].platformId).toBe("7234567890123");
  });

  it("deduplicates repeated aweme_id", () => {
    const body = {
      aweme_list: [
        { aweme_id: "111", desc: "a" },
        { aweme_id: "111", desc: "a duplicate" },
      ],
    };

    const items = parseDouyinSearchResponse(body);
    expect(items).toHaveLength(0);
  });

  it("returns empty array for unrelated payload", () => {
    expect(parseDouyinSearchResponse({ hello: "world" })).toEqual([]);
  });
});

describe("parseDouyinSearchResponseOrdered", () => {
  it("preserves aweme_list order without regex side ids", () => {
    const text = JSON.stringify({
      aweme_list: [
        { aweme_id: "7111111111111111111", desc: "first" },
        { aweme_id: "7222222222222222222", desc: "second" },
      ],
      extra: { aweme_id: "7999999999999999999", desc: "noise" },
    });

    const items = parseDouyinSearchResponseOrdered(text);
    expect(items.map((item) => item.platformId)).toEqual([
      "7111111111111111111",
      "7222222222222222222",
    ]);
  });
});

describe("mergeNetworkOrder", () => {
  it("appends ids in response order", () => {
    const order = mergeNetworkOrder([], [
      { platformId: "7111111111111111111", title: "a" },
      { platformId: "7222222222222222222", title: "b" },
    ]);
    expect(order).toEqual([
      "7111111111111111111",
      "7222222222222222222",
    ]);
  });
});

describe("parseDouyinSearchResponseText", () => {
  it("extracts ids via regex when JSON structure is unknown", () => {
    const text = '{"foo":{"aweme_id":7234567890123456789,"desc":"x"}}';
    const items = parseDouyinSearchResponseText(text);
    expect(items).toHaveLength(1);
    expect(items[0].platformId).toBe("7234567890123456789");
  });
});

describe("parseAwemeIdsFromText", () => {
  it("finds multiple ids in blob", () => {
    const text =
      '"aweme_id":"7111111111111111111" trailing "aweme_id":7222222222222222222';
    expect(parseAwemeIdsFromText(text)).toEqual([
      "7111111111111111111",
      "7222222222222222222",
    ]);
  });
});
