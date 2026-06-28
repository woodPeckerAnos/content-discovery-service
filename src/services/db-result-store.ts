/**
 * PostgreSQL 写入路径：一次搜索 = 一条 search_runs + 多条 content_items。
 *
 * platform_contents 按 (platform, platform_id) 去重并累加 seen_count；
 * content_items 保留当次发现时的快照（含 rank、title_at_discovery）。
 */
import type pg from "pg";
import { getPool } from "../db/pool.js";
import type { SearchResultPayload, UnifiedContentItem } from "../types/content.js";
import type { SearchRequest } from "../types/search.js";

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** @internal exported for unit tests */
export function buildPlatformContentParams(item: UnifiedContentItem) {
  return [
    item.platform,
    item.platformId,
    item.contentType,
    item.title,
    item.shareUrl,
    item.canonicalUrl ?? null,
    item.author?.id ?? null,
    item.author?.name ?? null,
    item.metrics?.likes ?? null,
    item.metrics?.views ?? null,
    item.metrics?.comments ?? null,
    parseTimestamp(item.publishedAt),
  ];
}

export async function upsertPlatformContent(
  client: pg.PoolClient,
  item: UnifiedContentItem,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    // ON CONFLICT：更新最新元数据并递增 seen_count，供跨批次去重统计
    `INSERT INTO platform_contents (
       platform, platform_id, content_type,
       title, share_url, canonical_url,
       author_id, author_name, likes, views, comments, published_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (platform, platform_id) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       title = EXCLUDED.title,
       share_url = EXCLUDED.share_url,
       canonical_url = EXCLUDED.canonical_url,
       author_id = EXCLUDED.author_id,
       author_name = EXCLUDED.author_name,
       likes = EXCLUDED.likes,
       views = EXCLUDED.views,
       comments = EXCLUDED.comments,
       published_at = EXCLUDED.published_at,
       last_seen_at = now(),
       seen_count = platform_contents.seen_count + 1,
       updated_at = now()
     RETURNING id`,
    buildPlatformContentParams(item),
  );

  return result.rows[0].id;
}

export async function writeSearchRun(
  req: SearchRequest,
  payload: Omit<SearchResultPayload, "request">,
): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const runResult = await client.query<{ id: string }>(
      `INSERT INTO search_runs
         (platform, mode, keyword, filters, limit_count, success, partial,
          actual_count, duration_ms, warnings)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [
        req.platform,
        req.mode,
        req.keyword ?? null,
        req.filters ? JSON.stringify(req.filters) : null,
        req.limit,
        payload.success,
        payload.partial ?? null,
        payload.actualCount,
        payload.durationMs,
        payload.warnings ? JSON.stringify(payload.warnings) : null,
      ],
    );

    const runId = runResult.rows[0].id;

    for (const item of payload.items) {
      await insertContentItem(client, runId, item);
    }

    await client.query("COMMIT");
    return `db:run:${runId}`;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertContentItem(
  client: pg.PoolClient,
  runId: string,
  item: UnifiedContentItem,
): Promise<void> {
  const platformContentId = await upsertPlatformContent(client, item);
  const fetchedAt = new Date(item.fetchedAt);

  await client.query(
    `INSERT INTO content_items
       (run_id, platform_content_id, platform, content_type, rank,
        title, title_at_discovery, share_url, canonical_url,
        platform_id, author_id, author_name, likes, views, comments,
        published_at, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      runId,
      platformContentId,
      item.platform,
      item.contentType,
      item.rank,
      item.title,
      item.title,
      item.shareUrl,
      item.canonicalUrl ?? null,
      item.platformId,
      item.author?.id ?? null,
      item.author?.name ?? null,
      item.metrics?.likes ?? null,
      item.metrics?.views ?? null,
      item.metrics?.comments ?? null,
      parseTimestamp(item.publishedAt),
      fetchedAt,
    ],
  );
}
