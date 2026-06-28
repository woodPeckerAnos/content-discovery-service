import type { JobMessage } from "job-queue";
import { initDatabase } from "../db/migrate.js";
import type { SearchRequest } from "../types/search.js";
import { log } from "../utils/logger.js";
import { parseSearchJobPayload } from "../api/search-request.js";
import {
  executeSearch,
  executeSearchBatch,
} from "../services/search-executor.js";

async function executeSearchJob(
  req: SearchRequest,
  jobName: string,
  messageId?: string,
): Promise<void> {
  log.info("Starting search job", {
    job_name: jobName,
    job_id: messageId,
    context: {
      platform: req.platform,
      keyword: req.keyword,
      limit: req.limit,
    },
  });

  const result = await executeSearch(req);

  log.info("Search job finished", {
    job_name: jobName,
    job_id: messageId,
    duration_ms: result.durationMs,
    context: {
      platform: req.platform,
      keyword: req.keyword,
      success: result.success,
      partial: result.partial ?? false,
      actualCount: result.actualCount,
      outputPath: result.outputPath,
    },
  });

  if (!result.success) {
    throw new Error(
      `搜索无结果: ${req.platform}/${req.keyword ?? req.mode}`,
    );
  }

  if (result.warnings?.length) {
    log.warn("Search completed with warnings", {
      job_name: jobName,
      context: { warnings: result.warnings },
    });
  }
}

export async function handleContentDiscoveryJob(
  message: JobMessage,
): Promise<void> {
  await initDatabase();

  const parsed = parseSearchJobPayload(message.payload);

  if (Array.isArray(parsed)) {
    log.info("Running batch search job", {
      job_name: message.jobName,
      context: { count: parsed.length },
    });
    const results = await executeSearchBatch(parsed);
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      throw new Error(
        `批量搜索 ${failed.length}/${results.length} 个任务无结果`,
      );
    }
    return;
  }

  await executeSearchJob(parsed, message.jobName);
}
