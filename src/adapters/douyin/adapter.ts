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
  loadDouyinConfig,
  matchesDouyinNetworkUrl,
  resolveDouyinFilters,
} from "./filter-map.js";
import {
  mergeParsedItems,
  parseDouyinSearchResponse,
  type ParsedDouyinItem,
} from "./network-parser.js";

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
    const filters = await resolveDouyinFilters(req.filters);
    const collected = new Map<string, ParsedDouyinItem>();

    const onResponse = async (response: import("playwright-core").Response) => {
      const url = response.url();
      if (!matchesDouyinNetworkUrl(platformCfg, url)) return;
      try {
        const json = await response.json();
        mergeParsedItems(collected, parseDouyinSearchResponse(json));
      } catch {
        // 非 JSON 响应忽略
      }
    };

    driver.onResponse(onResponse);

    try {
      const searchUrl = buildDouyinSearchUrl(platformCfg, req.keyword);
      await driver.goto(searchUrl);
      await driver.wait(3000);

      await driver.act(
        [
          "如果页面有登录弹窗或引导弹窗，先关闭它们。",
          `打开筛选面板，设置：内容类型=${filters.contentTypeLabel}，排序=${filters.sortByLabel}，发布时间=${filters.publishTimeLabel}，然后确认筛选。`,
          "确保当前在搜索结果列表页。",
        ].join("\n"),
      );

      await this.scrollUntilLimit(driver, collected, req.limit, config.MAX_SCROLLS, config.SCROLL_DELAY_MS);

      let items = this.normalizeItems(collected, req, platformCfg);

      if (items.length === 0) {
        items = await this.extractFallback(driver, req, platformCfg);
      }

      return items.slice(0, req.limit);
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
    }

    if (collected.size < limit) {
      await driver.act("继续向下滚动页面，加载更多搜索结果，直到列表明显变长。");
      for (let i = 0; i < 3; i++) {
        if (collected.size >= limit) break;
        await driver.scroll(900);
        await sleep(delayMs);
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

    return Array.from(collected.values()).map((item, index) => {
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
      `从当前搜索结果列表中提取最多 ${req.limit} 条视频，每条包含标题和链接。`,
      fallbackExtractSchema,
    );

    const fetchedAt = new Date().toISOString();
    const contentType = (req.filters?.contentType as ContentType) ?? "video";

    return extracted.map((row, index) => {
      const platformId =
        row.platformId ??
        row.shareUrl.match(/video\/(\d+)/)?.[1] ??
        String(index + 1);
      const canonicalUrl = buildDouyinCanonicalUrl(platformCfg, platformId);
      return {
        platform: "douyin" as const,
        contentType,
        rank: index + 1,
        title: row.title,
        shareUrl: row.shareUrl.includes("http") ? row.shareUrl : canonicalUrl,
        canonicalUrl,
        platformId,
        fetchedAt,
      };
    });
  }
}
