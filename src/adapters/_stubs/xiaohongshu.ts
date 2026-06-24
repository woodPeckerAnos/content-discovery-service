/**
 * 小红书 adapter 占位 — 后续实现图文/视频搜索。
 * 建议使用 browser-harness attach 已登录 Chrome + domain-skills。
 */
import type { PlatformAdapter } from "../platform-adapter.js";
import { NotImplementedError } from "../platform-adapter.js";
import type { BrowserDriver } from "../../drivers/browser-driver.js";
import type { SearchRequest, TrendingRequest } from "../../types/search.js";
import type { UnifiedContentItem } from "../../types/content.js";

export class XiaohongshuAdapter implements PlatformAdapter {
  readonly platform = "xiaohongshu" as const;

  async search(_req: SearchRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
    throw new NotImplementedError("xiaohongshu", "search");
  }

  async trending(_req: TrendingRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
    throw new NotImplementedError("xiaohongshu", "trending");
  }
}
