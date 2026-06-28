import Router from "@koa/router";
import {
  parseBatchSearchBody,
  parseSearchRequestBody,
} from "../../api/search-request.js";
import {
  executeSearch,
  executeSearchBatch,
  searchExecutor,
} from "../../services/search-executor.js";
import type { SearchRequest, SearchResult } from "../../types/search.js";
import { log } from "../../utils/logger.js";
import {
  completeAsyncSearchJob,
  createAsyncSearchJob,
  failAsyncSearchJob,
  getAsyncSearchJob,
  listAsyncSearchJobs,
  markAsyncSearchRunning,
} from "../async-jobs.js";

function searchResultResponse(result: SearchResult) {
  return {
    success: result.success,
    partial: result.partial ?? false,
    actualCount: result.actualCount,
    durationMs: result.durationMs,
    warnings: result.warnings,
    outputPath: result.outputPath,
    items: result.items,
  };
}

export function createSearchRouter(): Router {
  const router = new Router({ prefix: "/v1" });

  router.post("/search", async (ctx) => {
    const searchReq = parseSearchRequestBody(ctx.request.body);
    log.info("HTTP sync search started", {
      context: {
        platform: searchReq.platform,
        keyword: searchReq.keyword,
        limit: searchReq.limit,
      },
    });

    const result = await executeSearch(searchReq);
    const body = searchResultResponse(result);

    if (!result.success) {
      ctx.status = 422;
      ctx.body = { ...body, error: "搜索无结果" };
      return;
    }

    ctx.body = body;
  });

  router.post("/search/batch", async (ctx) => {
    const requests = parseBatchSearchBody(ctx.request.body);
    log.info("HTTP batch search started", {
      context: { count: requests.length },
    });

    const results = await executeSearchBatch(requests);
    const failed = results.filter((item) => !item.success);

    ctx.status = failed.length > 0 ? 422 : 200;
    ctx.body = {
      count: results.length,
      failedCount: failed.length,
      results: results.map(searchResultResponse),
    };
  });

  router.post("/search/async", async (ctx) => {
    const searchReq = parseSearchRequestBody(ctx.request.body);
    const job = createAsyncSearchJob();

    void runAsyncSearch(job.id, searchReq);

    ctx.status = 202;
    ctx.body = {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
    };
  });

  router.get("/search/jobs", (ctx) => {
    ctx.body = { jobs: listAsyncSearchJobs() };
  });

  router.get("/search/jobs/:id", (ctx) => {
    const job = getAsyncSearchJob(ctx.params.id);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: "Job not found" };
      return;
    }

    ctx.body = job;
  });

  router.get("/search/queue/stats", (ctx) => {
    ctx.body = searchExecutor.stats;
  });

  return router;
}

async function runAsyncSearch(
  id: string,
  searchReq: SearchRequest,
): Promise<void> {
  markAsyncSearchRunning(id);
  try {
    const result = await executeSearch(searchReq);
    if (!result.success) {
      failAsyncSearchJob(id, "搜索无结果");
      return;
    }
    completeAsyncSearchJob(id, result);
    log.info("HTTP async search completed", {
      request_id: id,
      duration_ms: result.durationMs,
      context: {
        keyword: searchReq.keyword,
        actualCount: result.actualCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAsyncSearchJob(id, message);
    log.error("HTTP async search failed", {
      request_id: id,
      error,
    });
  }
}
