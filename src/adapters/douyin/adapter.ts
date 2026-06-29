/**
 * 抖音搜索适配器：网络响应解析为主、DOM/LLM extract 为辅。
 *
 * 监听 search API 响应合并 aweme 列表；条数不足时用 Stagehand scroll + extract 补全。
 */
import { z } from "zod";
import { loadConfig } from "../../config.js";
import { sleep } from "../../utils/retry.js";
import type { BrowserDriver } from "../../drivers/browser-driver.js";
import type { PlatformAdapter } from "../platform-adapter.js";
import { NotImplementedError } from "../platform-adapter.js";
import type { SearchRequest, TrendingRequest } from "../../types/search.js";
import type { ContentType, UnifiedContentItem } from "../../types/content.js";
import {
  buildDouyinCanonicalUrl,
  buildDouyinSearchUrl,
  isGeneralTabSearchNetworkUrl,
  loadDouyinConfig,
  matchesDouyinNetworkUrl,
} from "./filter-map.js";
import { applyDouyinSearchFilters } from "./search-ui.js";
import { log } from "../../utils/logger.js";
import {
  domItemsToParsed,
  extractVideosFromDom,
} from "./dom-extractor.js";
import {
  isValidDouyinVideoId,
  mergeParsedItems,
  parseDouyinSearchResponseText,
  type ParsedDouyinItem,
} from "./network-parser.js";
import { parseVideoIdFromHref } from "./url-utils.js";

const fallbackExtractSchema = z.array(
  z.object({
    title: z.string(),
    shareUrl: z.string(),
    platformId: z.string().optional(),
  }),
);

export class DouyinAdapter implements PlatformAdapter {
  readonly platform = "douyin" as const;

  async search(
    req: SearchRequest,
    driver: BrowserDriver,
  ): Promise<UnifiedContentItem[]> {
    if (req.mode !== "keyword" || !req.keyword?.trim()) {
      throw new Error("抖音搜索需要提供 keyword");
    }

    const config = loadConfig();
    const platformCfg = await loadDouyinConfig();
    const collected = new Map<string, ParsedDouyinItem>();
    let captureEnabled = false;
    let resolveFirstCapture: (() => void) | null = null;

    const onResponse = async (response: import("playwright-core").Response) => {
      if (!captureEnabled) {
        return;
      }

      const url = response.url();
      if (!matchesDouyinNetworkUrl(platformCfg, url)) {
        return;
      }
      if (isGeneralTabSearchNetworkUrl(url)) {
        return;
      }

      try {
        const text = await response.text();
        if (!text.includes("aweme_id") && !text.includes("awemeId")) {
          return;
        }

        const before = collected.size;
        mergeParsedItems(collected, parseDouyinSearchResponseText(text));
        if (collected.size > before && resolveFirstCapture) {
          resolveFirstCapture();
          resolveFirstCapture = null;
        }
      } catch {
        // 忽略无法读取的响应
      }
    };

    driver.onResponse(onResponse);

    try {
      const searchUrl = buildDouyinSearchUrl(
        platformCfg,
        req.keyword,
        req.filters,
      );
      await driver.goto(searchUrl);
      await driver.wait(3000);

      await driver.act("如果页面有登录弹窗或引导弹窗，先关闭它们。");
      const filterResult = await applyDouyinSearchFilters(
        driver,
        platformCfg,
        req.filters,
      );
      await driver.wait(2000);

      collected.clear();
      captureEnabled = true;

      const firstCapture = new Promise<void>((resolve) => {
        resolveFirstCapture = resolve;
      });
      await Promise.race([
        firstCapture,
        sleep(10_000).then(() => undefined),
      ]);
      resolveFirstCapture = null;

      log.info("Douyin search capture started after filters", {
        context: {
          captureEnabled: true,
          tabActive: filterResult.tabActive,
          panel: filterResult.panel,
          sort: filterResult.sort,
          publish: filterResult.publish,
          prefilledCount: collected.size,
        },
      });

      await this.scrollUntilLimit(
        driver,
        collected,
        req.limit,
        config.MAX_SCROLLS,
        config.SCROLL_DELAY_MS,
      );

      await this.collectFromDom(driver, collected);

      let items = this.normalizeItems(collected, req, platformCfg);

      if (items.length < req.limit) {
        await this.scrollUntilLimit(driver, collected, req.limit, 3, config.SCROLL_DELAY_MS);
        await this.collectFromDom(driver, collected);
        items = this.normalizeItems(collected, req, platformCfg);
      }

      if (items.length === 0) {
        items = await this.extractFallback(driver, req, platformCfg);
      }

      return items
        .filter((item) => isValidDouyinVideoId(item.platformId))
        .slice(0, req.limit);
    } finally {
      driver.offResponse(onResponse);
    }
  }

  async trending(
    _req: TrendingRequest,
    _driver: BrowserDriver,
  ): Promise<UnifiedContentItem[]> {
    throw new NotImplementedError("douyin", "trending");
  }

  private async collectFromDom(
    driver: BrowserDriver,
    collected: Map<string, ParsedDouyinItem>,
  ): Promise<void> {
    const domItems = await extractVideosFromDom((script) =>
      driver.evaluateScript(script),
    );
    mergeParsedItems(collected, domItemsToParsed(domItems));
  }

  private async scrollUntilLimit(
    driver: BrowserDriver,
    collected: Map<string, ParsedDouyinItem>,
    limit: number,
    maxScrolls: number,
    delayMs: number,
  ): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      if (collected.size >= limit) break;
      await driver.scroll(900);
      await sleep(delayMs);
      if (collected.size >= limit) break;
      await this.collectFromDom(driver, collected);
    }

    if (collected.size < limit) {
      await driver.act("继续向下滚动页面，加载更多搜索结果。");
      for (let i = 0; i < 3; i++) {
        if (collected.size >= limit) break;
        await driver.scroll(900);
        await sleep(delayMs);
        await this.collectFromDom(driver, collected);
      }
    }
  }

  private normalizeItems(
    collected: Map<string, ParsedDouyinItem>,
    req: SearchRequest,
    platformCfg: Awaited<ReturnType<typeof loadDouyinConfig>>,
  ): UnifiedContentItem[] {
    const contentType = (req.filters?.contentType as ContentType) ?? "video";
    const fetchedAt = new Date().toISOString();

    return Array.from(collected.values())
      .filter((item) => isValidDouyinVideoId(item.platformId))
      .map((item, index) => {
        const canonicalUrl = buildDouyinCanonicalUrl(platformCfg, item.platformId);
        return {
          platform: "douyin" as const,
          contentType,
          rank: index + 1,
          title: item.title,
          shareUrl: canonicalUrl,
          canonicalUrl,
          platformId: item.platformId,
          author: item.author,
          metrics: item.metrics,
          publishedAt: item.publishedAt,
          fetchedAt,
        };
      });
  }

  private async extractFallback(
    driver: BrowserDriver,
    req: SearchRequest,
    platformCfg: Awaited<ReturnType<typeof loadDouyinConfig>>,
  ): Promise<UnifiedContentItem[]> {
    const extracted = await driver.extract(
      `从当前搜索结果列表中提取最多 ${req.limit} 条视频。每条必须包含完整视频链接（形如 https://www.douyin.com/video/数字ID）和标题。`,
      fallbackExtractSchema,
    );

    const fetchedAt = new Date().toISOString();
    const contentType = (req.filters?.contentType as ContentType) ?? "video";

    const items: UnifiedContentItem[] = [];

    for (const [index, row] of extracted.entries()) {
      const fromUrl = parseVideoIdFromHref(row.shareUrl);
      const platformId =
        row.platformId && isValidDouyinVideoId(row.platformId)
          ? row.platformId
          : (fromUrl ?? "");
      if (!isValidDouyinVideoId(platformId)) continue;

      const canonicalUrl = buildDouyinCanonicalUrl(platformCfg, platformId);
      items.push({
        platform: "douyin",
        contentType,
        rank: index + 1,
        title: row.title,
        shareUrl: canonicalUrl,
        canonicalUrl,
        platformId,
        fetchedAt,
      });
    }

    return items;
  }
}
