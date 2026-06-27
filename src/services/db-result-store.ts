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
  await client.query(
    `INSERT INTO content_items
       (run_id, platform, content_type, rank, title, share_url, canonical_url,
        platform_id, author_id, author_name, likes, views, comments,
        published_at, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      runId,
      item.platform,
      item.contentType,
      item.rank,
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
      new Date(item.fetchedAt),
    ],
  );
}
