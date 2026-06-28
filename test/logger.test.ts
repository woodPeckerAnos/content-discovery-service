import { describe, expect, it } from "vitest";
import { buildLogEntry } from "../src/utils/logger.js";

describe("buildLogEntry", () => {
  it("matches log-entry.schema required fields", () => {
    const entry = buildLogEntry("info", "Search job completed", {
      job_name: "douyin_search_crystal",
      duration_ms: 12450,
    });

    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe("info");
    expect(entry.service).toBe("content-discovery");
    expect(entry.message).toBe("Search job completed");
    expect(entry.job_name).toBe("douyin_search_crystal");
    expect(entry.duration_ms).toBe(12450);
    expect(entry.env).toBeDefined();
    expect(entry.version).toBeDefined();
  });

  it("includes error object for error level", () => {
    const entry = buildLogEntry("error", "Search job failed", {
      error: new Error("Browser launch failed"),
    });

    expect(entry.error).toMatchObject({
      type: "Error",
      message: "Browser launch failed",
    });
    expect(entry.error?.stack).toBeDefined();
  });

  it("maps http context", () => {
    const entry = buildLogEntry("info", "HTTP request", {
      http: {
        method: "POST",
        path: "/v1/search",
        status: 200,
        duration_ms: 12,
      },
    });

    expect(entry.http).toEqual({
      method: "POST",
      path: "/v1/search",
      status: 200,
      duration_ms: 12,
    });
  });
});
