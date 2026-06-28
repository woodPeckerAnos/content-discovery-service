import { describe, expect, it } from "vitest";
import { buildSearchBatchId } from "../../src/mq/search-profiles.js";

describe("buildSearchBatchId", () => {
  it("normalizes triggeredAt into a compact batch id", () => {
    expect(buildSearchBatchId("2026-06-28T09:00:00.000Z")).toBe(
      "20260628T090000",
    );
  });
});
