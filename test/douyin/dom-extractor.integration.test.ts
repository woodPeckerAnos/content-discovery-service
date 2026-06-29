import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EXTRACT_VIDEOS_SCRIPT,
  extractVideosFromDom,
  mergeDomOrder,
} from "../../src/adapters/douyin/dom-extractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockFixturePath = path.join(__dirname, "../fixtures/douyin-search-page.html");
const scrollFixturePath = path.join(
  __dirname,
  "../fixtures/douyin-search-scroll-list.html",
);

/** 与 StagehandDriver.evaluateScript 相同：字符串箭头函数需显式调用 */
function evaluateScript<T>(
  page: { evaluate: (expr: string) => Promise<T> },
  script: string,
): Promise<T> {
  const trimmed = script.trim();
  const expression = trimmed.startsWith("()") ? `(${trimmed})()` : trimmed;
  return page.evaluate(expression);
}

describe("dom-extractor (Playwright integration)", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("runs EXTRACT_VIDEOS_SCRIPT in Chromium without evaluate errors", async () => {
    const page = await browser.newPage();
    await page.goto(`file://${mockFixturePath}`);

    const result = await evaluateScript(page, EXTRACT_VIDEOS_SCRIPT);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    await page.close();
  });

  it("extracts mock search cards in document order", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="search-result-container">
        <ul data-e2e="scroll-list">
          <li><div class="search-result-card">
            <a href="https://www.douyin.com/video/7123456789012345678">紫水晶入门</a>
            <div class="video-desc">天然紫水晶手串 #水晶 #紫水晶</div>
          </div></li>
          <li><div class="search-result-card">
            <a href="/video/7987654321098765432">白水晶功效</a>
          </div></li>
        </ul>
      </div>
    `);

    const items = await extractVideosFromDom((script) =>
      evaluateScript(page, script),
    );

    expect(items.map((item) => item.platformId)).toEqual([
      "7123456789012345678",
      "7987654321098765432",
    ]);
    expect(items[0]?.title).toContain("#紫水晶");
    await page.close();
  });

  it("matches real PC scroll-list order from captured HTML", async () => {
    const page = await browser.newPage();
    await page.goto(`file://${scrollFixturePath}`);

    const items = await extractVideosFromDom((script) =>
      evaluateScript(page, script),
    );

    expect(items).toHaveLength(50);
    expect(items[0]?.platformId).toBe("7656092270898792933");
    expect(items[1]?.platformId).toBe("7654916792908778798");
    expect(items[2]?.platformId).toBe("7655997462921989416");

    for (const item of items) {
      expect(item.platformId).toMatch(/^\d{10,25}$/);
    }
    await page.close();
  });

  it("ignores hidden waterfall and out-of-container video links", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <a href="https://www.douyin.com/video/7111111111111111111">推荐区</a>
      <div id="search-result-container">
        <div style="display:none">
          <div id="waterfall_item_7222222222222222222" style="transform: translate(0px, 0px);">
            <div class="search-result-card"><a href="/video/7222222222222222222">隐藏瀑布流</a></div>
          </div>
        </div>
        <ul data-e2e="scroll-list">
          <li><div class="search-result-card">
            <a href="https://www.douyin.com/video/7333333333333333333">可见结果</a>
          </div></li>
        </ul>
      </div>
    `);

    const items = await extractVideosFromDom((script) =>
      evaluateScript(page, script),
    );

    expect(items.map((item) => item.platformId)).toEqual([
      "7333333333333333333",
    ]);
    await page.close();
  });

  it("documents that raw page.evaluate(string) does NOT invoke arrow functions", async () => {
    const page = await browser.newPage();
    const script = `() => ({ ok: true })`;
    const raw = await page.evaluate(script);
    expect(raw).toBeUndefined();
    const invoked = await evaluateScript(page, script);
    expect(invoked).toEqual({ ok: true });
    await page.close();
  });
});

describe("mergeDomOrder", () => {
  it("appends new ids while preserving first-seen order", () => {
    const order = mergeDomOrder(["1111111111111111111"], [
      { platformId: "1111111111111111111" },
      { platformId: "2222222222222222222" },
      { platformId: "3333333333333333333" },
    ]);

    expect(order).toEqual([
      "1111111111111111111",
      "2222222222222222222",
      "3333333333333333333",
    ]);
  });
});
