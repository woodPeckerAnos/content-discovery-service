import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDouyinSearchResponse } from "../../src/adapters/douyin/network-parser.js";

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
      title: "简单家常菜教程",
      author: { name: "美食博主" },
      metrics: { likes: 12000, comments: 300, views: 500000 },
    });
    expect(items[1].platformId).toBe("7987654321098765432");
  });

  it("deduplicates repeated aweme_id", () => {
    const body = {
      aweme_list: [
        {
          aweme_id: "111",
          desc: "a",
        },
        {
          aweme_id: "111",
          desc: "a duplicate",
        },
      ],
    };

    const items = parseDouyinSearchResponse(body);
    expect(items).toHaveLength(1);
    expect(items[0].platformId).toBe("111");
  });

  it("returns empty array for unrelated payload", () => {
    expect(parseDouyinSearchResponse({ hello: "world" })).toEqual([]);
  });
});
