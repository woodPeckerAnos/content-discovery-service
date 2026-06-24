/**
 * X (Twitter) adapter 占位 — 后续优先 ApiDriver，Stagehand 作 fallback。
 */
import type { PlatformAdapter } from "../platform-adapter.js";
import { NotImplementedError } from "../platform-adapter.js";
import type { BrowserDriver } from "../../drivers/browser-driver.js";
import type { SearchRequest, TrendingRequest } from "../../types/search.js";
import type { UnifiedContentItem } from "../../types/content.js";

export class XAdapter implements PlatformAdapter {
  readonly platform = "x" as const;

  async search(_req: SearchRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
    throw new NotImplementedError("x", "search");
  }

  async trending(_req: TrendingRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
    throw new NotImplementedError("x", "trending");
  }
}
