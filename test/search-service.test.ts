import { describe, expect, it } from "vitest";
import { validateSearchRequest } from "../src/types/search.js";

describe("validateSearchRequest", () => {
  it("requires keyword for keyword mode", () => {
    expect(() =>
      validateSearchRequest({
        platform: "douyin",
        mode: "keyword",
        limit: 50,
      }),
    ).toThrow("关键词搜索需要提供 keyword");
  });

  it("rejects invalid limit", () => {
    expect(() =>
      validateSearchRequest({
        platform: "douyin",
        mode: "keyword",
        keyword: "test",
        limit: 0,
      }),
    ).toThrow("limit 必须在 1–100 之间");
  });

  it("accepts valid request", () => {
    expect(() =>
      validateSearchRequest({
        platform: "douyin",
        mode: "keyword",
        keyword: "家常菜",
        limit: 50,
      }),
    ).not.toThrow();
  });
});

describe("search-service validation helpers", () => {
  it("placeholder for integration tests", () => {
    expect(true).toBe(true);
  });
});
