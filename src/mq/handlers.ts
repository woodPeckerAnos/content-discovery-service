/**
 * 队列任务处理：runLabel → search-profiles.yaml → executeSearch → 可选 pipeline 派发。
 *
 * MQ  payload 只传 runLabel，关键词与筛选条件集中在 config/search-profiles.yaml，
 * 便于 job-scheduler 侧只维护调度标签。
 */
import type { JobMessage } from "job-queue";
import { initDatabase } from "../db/migrate.js";
import type { SearchRequest, SearchResult } from "../types/search.js";
import { log } from "../utils/logger.js";
import { executeSearch } from "../services/search-executor.js";
import {
  buildSearchBatchId,
  resolveSearchProfile,
} from "./search-profiles.js";
import { dispatchPipelineJobsForVideos } from "./dispatch.js";

const DOUYIN_SEARCH_JOB = "douyin_search";

async function resolveSearchRequest(message: JobMessage): Promise<SearchRequest> {
  if (message.jobName !== DOUYIN_SEARCH_JOB) {
    throw new Error(`Unsupported job: ${message.jobName}`);
  }

  const runLabel = message.payload.runLabel;
  if (typeof runLabel !== "string" || !runLabel.trim()) {
    throw new Error(
      `${DOUYIN_SEARCH_JOB} requires payload.runLabel (keywords live in search-profiles.yaml)`,
    );
  }

  return resolveSearchProfile(runLabel.trim());
}

async function executeSearchJob(
  req: SearchRequest,
  jobName: string,
  message: JobMessage,
): Promise<SearchResult> {
  log.info("Starting search job", {
    job_name: jobName,
    trace_id: message.traceId,
    context: {
      platform: req.platform,
      keyword: req.keyword,
      limit: req.limit,
      run_label: message.payload.runLabel,
    },
  });

  const result = await executeSearch(req);

  log.info("Search job finished", {
    job_name: jobName,
    trace_id: message.traceId,
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
      trace_id: message.traceId,
      context: { warnings: result.warnings },
    });
  }

  return result;
}

export async function handleContentDiscoveryJob(
  message: JobMessage,
): Promise<void> {
  await initDatabase();

  if (message.jobName === DOUYIN_SEARCH_JOB) {
    const req = await resolveSearchRequest(message);
    const result = await executeSearchJob(req, message.jobName, message);

    await dispatchPipelineJobsForVideos(result.items, {
      sourceJob: message.jobName,
      searchBatchId: buildSearchBatchId(message.triggeredAt),
      traceId: message.traceId,
    });
    return;
  }

  throw new Error(`No handler logic for job: ${message.jobName}`);
}
