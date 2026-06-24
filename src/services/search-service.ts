import { getAdapter } from "../adapters/registry.js";
import { createStagehandDriver } from "../drivers/stagehand-driver.js";
import { loadConfig } from "../config.js";
import { retryOnce } from "../utils/retry.js";
import type { SearchRequest, SearchResult } from "../types/search.js";
import { validateSearchRequest } from "../types/search.js";
import { resultStore } from "./result-store.js";

function validateItems(
  items: import("../types/content.js").UnifiedContentItem[],
  req: SearchRequest,
): { ok: boolean; warnings: string[] } {
  const config = loadConfig();
  const warnings: string[] = [];
  const minExpected = Math.floor(req.limit * config.MIN_RESULT_RATIO);

  if (items.length < minExpected) {
    warnings.push(
      `结果不足：期望至少 ${minExpected} 条，实际 ${items.length} 条`,
    );
  }

  for (const item of items) {
    if (!item.shareUrl || !item.platformId) {
      warnings.push(`第 ${item.rank} 条缺少 shareUrl 或 platformId`);
    }
  }

  return { ok: items.length >= minExpected, warnings };
}

export async function runSearch(req: SearchRequest): Promise<SearchResult> {
  validateSearchRequest(req);
  const config = loadConfig();
  const started = Date.now();
  const warnings: string[] = [];

  const execute = async () => {
    const driver = await createStagehandDriver(req.platform);
    try {
      const adapter = getAdapter(req.platform);
      const items = await adapter.search(req, driver);
      return items;
    } finally {
      await driver.close();
    }
  };

  const { result: items, retried } = await retryOnce(execute, (result) => {
    const check = validateItems(result, req);
    return !check.ok;
  });

  if (retried) {
    warnings.push("首次结果不足，已自动重试一次");
  }

  const validation = validateItems(items, req);
  warnings.push(...validation.warnings);
  const partial = !validation.ok;

  const durationMs = Date.now() - started;
  const outputPath = await resultStore.write(req, {
    success: items.length > 0,
    partial,
    actualCount: items.length,
    durationMs,
    items,
    warnings: warnings.length ? warnings : undefined,
  });

  return {
    success: items.length > 0,
    partial,
    items,
    actualCount: items.length,
    durationMs,
    warnings: warnings.length ? warnings : undefined,
    outputPath,
  };
}

export async function runSearchBatch(
  requests: SearchRequest[],
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  for (const req of requests) {
    results.push(await runSearch(req));
  }
  return results;
}
