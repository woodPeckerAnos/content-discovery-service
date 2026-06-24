export type {
  Platform,
  ContentType,
  SearchMode,
  UnifiedContentItem,
  SearchResultPayload,
} from "./types/content.js";

export type {
  SearchRequest,
  TrendingRequest,
  SearchResult,
} from "./types/search.js";

export { PLATFORMS, validateSearchRequest } from "./types/search.js";
export { getAdapter, listAdapters } from "./adapters/registry.js";
export { runSearch, runSearchBatch } from "./services/search-service.js";
export { createStagehandDriver } from "./drivers/stagehand-driver.js";
export { loadConfig } from "./config.js";
