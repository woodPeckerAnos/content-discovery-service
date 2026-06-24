import type { BrowserDriver } from "../drivers/browser-driver.js";
import type {
  TrendingRequest,
  SearchRequest,
} from "../types/search.js";
import type { UnifiedContentItem } from "../types/content.js";
import type { Platform } from "../types/content.js";

export class NotImplementedError extends Error {
  constructor(platform: Platform, feature: string) {
    super(`${platform} 平台的 ${feature} 尚未实现`);
    this.name = "NotImplementedError";
  }
}

export interface PlatformAdapter {
  readonly platform: Platform;
  search(
    req: SearchRequest,
    driver: BrowserDriver,
  ): Promise<UnifiedContentItem[]>;
  trending(
    req: TrendingRequest,
    driver: BrowserDriver,
  ): Promise<UnifiedContentItem[]>;
}
