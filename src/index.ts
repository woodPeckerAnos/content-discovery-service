/** 库导出：供 monorepo 内其他包或集成测试引用核心类型与搜索 API。 */
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
export {
  parseSearchJobPayload,
  parseSearchRequestBody,
  parseBatchSearchBody,
} from "./api/search-request.js";
export { executeSearch, executeSearchBatch, searchExecutor } from "./services/search-executor.js";
export { handleContentDiscoveryJob } from "./mq/handlers.js";
export { createApp, startServer } from "./server/index.js";
