/**
 * 搜索完成后向下游服务派发子任务（评论抓取、字幕提取等）。
 *
 * 可通过 DISPATCH_PIPELINE_JOBS=false 关闭；队列名由 COMMENTS_QUEUE_NAME / TRANSCRIPT_QUEUE_NAME 覆盖。
 */
import {
  enqueueJob,
  queueConfigFromEnv,
  type QueueConfig,
} from "job-queue";
import type { UnifiedContentItem } from "../types/content.js";
import { log } from "../utils/logger.js";

export interface PipelineDispatchContext {
  sourceJob: string;
  searchBatchId: string;
  traceId?: string;
}

function queueConfig(queueName: string): QueueConfig {
  return {
    ...queueConfigFromEnv(),
    queueName,
  };
}

function isPipelineDispatchEnabled(): boolean {
  return process.env.DISPATCH_PIPELINE_JOBS !== "false";
}

function commentsQueueName(): string {
  return process.env.COMMENTS_QUEUE_NAME ?? "comments-douyin";
}

function transcriptQueueName(): string {
  return process.env.TRANSCRIPT_QUEUE_NAME ?? "transcript";
}

export async function dispatchPipelineJobsForVideos(
  items: UnifiedContentItem[],
  ctx: PipelineDispatchContext,
): Promise<{ comments: number; transcript: number }> {
  if (!isPipelineDispatchEnabled()) {
    log.info("Pipeline dispatch skipped (DISPATCH_PIPELINE_JOBS=false)", {
      trace_id: ctx.traceId,
      context: { video_count: items.length },
    });
    return { comments: 0, transcript: 0 };
  }

  const videos = items.filter((item) => item.contentType === "video");
  if (videos.length === 0) {
    return { comments: 0, transcript: 0 };
  }

  const commentsConfig = queueConfig(commentsQueueName());
  const transcriptConfig = queueConfig(transcriptQueueName());
  let comments = 0;
  let transcript = 0;

  for (const video of videos) {
    const videoUrl = video.canonicalUrl ?? video.shareUrl;
    const basePayload = {
      videoId: video.platformId,
      videoUrl,
      sourceJob: ctx.sourceJob,
      searchBatchId: ctx.searchBatchId,
    };

    if (video.platform === "douyin") {
      await enqueueJob(
        commentsConfig,
        "douyin_fetch_comments",
        basePayload,
        { trigger: "pipeline", traceId: ctx.traceId },
      );
      comments++;
    }

    await enqueueJob(
      transcriptConfig,
      "fetch_transcript",
      {
        platform: video.platform,
        ...basePayload,
      },
      { trigger: "pipeline", traceId: ctx.traceId },
    );
    transcript++;
  }

  log.info("Pipeline jobs dispatched", {
    trace_id: ctx.traceId,
    context: {
      source_job: ctx.sourceJob,
      search_batch_id: ctx.searchBatchId,
      comments_queue: commentsConfig.queueName,
      transcript_queue: transcriptConfig.queueName,
      comments_jobs: comments,
      transcript_jobs: transcript,
    },
  });

  return { comments, transcript };
}
