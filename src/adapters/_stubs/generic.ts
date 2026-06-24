import type { Platform } from "../../types/content.js";
import type { PlatformAdapter } from "../platform-adapter.js";
import { NotImplementedError } from "../platform-adapter.js";
import type { BrowserDriver } from "../../drivers/browser-driver.js";
import type { SearchRequest, TrendingRequest } from "../../types/search.js";
import type { UnifiedContentItem } from "../../types/content.js";

export function createStubAdapter(platform: Platform): PlatformAdapter {
  return {
    platform,
    async search(_req: SearchRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
      throw new NotImplementedError(platform, "search");
    },
    async trending(_req: TrendingRequest, _driver: BrowserDriver): Promise<UnifiedContentItem[]> {
      throw new NotImplementedError(platform, "trending");
    },
  };
}
