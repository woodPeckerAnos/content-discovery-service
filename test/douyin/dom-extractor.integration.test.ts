import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EXTRACT_VIDEOS_SCRIPT,
  extractVideosFromDom,
} from "../../src/adapters/douyin/dom-extractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "../fixtures/douyin-search-page.html");
const fixtureUrl = `file://${fixturePath}`;

/** 与 StagehandDriver.evaluateScript 相同：字符串箭头函数需显式调用 */
function evaluateScript<T>(page: { evaluate: (expr: string) => Promise<T> }, script: string): Promise<T> {
  const trimmed = script.trim();
  const expression = trimmed.startsWith("()") ? `(${trimmed})()` : trimmed;
  return page.evaluate(expression);
}

describe("dom-extractor (Playwright integration)", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(fixtureUrl);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("runs EXTRACT_VIDEOS_SCRIPT in Chromium without evaluate errors", async () => {
    const result = await evaluateScript(page, EXTRACT_VIDEOS_SCRIPT);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("extracts video ids from fixture HTML via evaluateScript path", async () => {
    const items = await extractVideosFromDom((script) =>
      evaluateScript(page, script),
    );

    expect(items.length).toBeGreaterThanOrEqual(3);

    const ids = items.map((i) => i.platformId);
    expect(ids).toContain("7123456789012345678");
    expect(ids).toContain("7987654321098765432");
    expect(ids).toContain("7234567890123456789");
    expect(ids).toContain("7345678901234567890");

    const first = items.find((i) => i.platformId === "7123456789012345678");
    expect(first?.title).toContain("#紫水晶");

    for (const item of items) {
      expect(item.platformId).toMatch(/^\d{10,25}$/);
    }
  });

  it("documents that raw page.evaluate(string) does NOT invoke arrow functions", async () => {
    const script = `() => ({ ok: true })`;
    const raw = await page.evaluate(script);
    expect(raw).toBeUndefined();
    const invoked = await evaluateScript(page, script);
    expect(invoked).toEqual({ ok: true });
  });
});
