import { describe, expect, it } from "vitest";
import {
  parseBatchSearchBody,
  parseSearchJobPayload,
  parseSearchRequestBody,
} from "../../src/api/search-request.js";

describe("parseSearchRequestBody", () => {
  it("parses valid search body", () => {
    const req = parseSearchRequestBody({
      platform: "douyin",
      keyword: "水晶",
      limit: 10,
    });

    expect(req.platform).toBe("douyin");
    expect(req.keyword).toBe("水晶");
    expect(req.limit).toBe(10);
  });

  it("rejects missing keyword", () => {
    expect(() =>
      parseSearchRequestBody({
        platform: "douyin",
        limit: 10,
      }),
    ).toThrow();
  });
});

describe("parseBatchSearchBody", () => {
  it("parses batch body", () => {
    const reqs = parseBatchSearchBody({
      searches: [
        { platform: "douyin", keyword: "水晶", limit: 5 },
        { platform: "douyin", keyword: "家常菜", limit: 5 },
      ],
    });

    expect(reqs).toHaveLength(2);
  });
});

describe("parseSearchJobPayload", () => {
  it("supports MQ single payload", () => {
    const req = parseSearchJobPayload({
      platform: "douyin",
      mode: "keyword",
      keyword: "水晶",
      limit: 5,
    });

    expect(Array.isArray(req)).toBe(false);
  });

  it("supports MQ batch payload", () => {
    const req = parseSearchJobPayload({
      searches: [{ platform: "douyin", keyword: "水晶", limit: 5 }],
    });

    expect(Array.isArray(req)).toBe(true);
  });
});
