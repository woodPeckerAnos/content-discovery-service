export interface ParsedDouyinItem {
  platformId: string;
  title: string;
  author?: { id?: string; name?: string };
  metrics?: { likes?: number; views?: number; comments?: number };
  publishedAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number") return val;
    if (typeof val === "string" && val !== "" && !Number.isNaN(Number(val))) {
      return Number(val);
    }
  }
  return undefined;
}

function parseAwemeNode(node: Record<string, unknown>): ParsedDouyinItem | null {
  const awemeInfo = asRecord(node.aweme_info) ?? node;
  const platformId = pickString(awemeInfo, "aweme_id", "awemeId", "group_id");
  if (!platformId) return null;

  const authorObj = asRecord(awemeInfo.author);
  const stats = asRecord(awemeInfo.statistics) ?? asRecord(awemeInfo.stats);

  const title =
    pickString(awemeInfo, "desc", "title", "content") || `抖音视频 ${platformId}`;

  let publishedAt: string | undefined;
  const createTime = awemeInfo.create_time ?? awemeInfo.createTime;
  if (typeof createTime === "number") {
    publishedAt = new Date(createTime * 1000).toISOString();
  }

  return {
    platformId,
    title,
    author: authorObj
      ? {
          id: pickString(authorObj, "uid", "sec_uid") || undefined,
          name: pickString(authorObj, "nickname", "unique_id") || undefined,
        }
      : undefined,
    metrics: stats
      ? {
          likes: pickNumber(stats, "digg_count", "like_count"),
          views: pickNumber(stats, "play_count", "view_count"),
          comments: pickNumber(stats, "comment_count"),
        }
      : undefined,
    publishedAt,
  };
}

function collectAwemeNodes(payload: unknown, out: ParsedDouyinItem[]): void {
  if (Array.isArray(payload)) {
    for (const item of payload) collectAwemeNodes(item, out);
    return;
  }

  const record = asRecord(payload);
  if (!record) return;

  const direct = parseAwemeNode(record);
  if (direct) {
    out.push(direct);
  }

  const listKeys = [
    "aweme_list",
    "data",
    "item_list",
    "items",
    "business_data",
    "search_result",
  ];

  for (const key of listKeys) {
    if (key in record) {
      collectAwemeNodes(record[key], out);
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value) || asRecord(value)) {
      collectAwemeNodes(value, out);
    }
  }
}

export function parseDouyinSearchResponse(body: unknown): ParsedDouyinItem[] {
  const items: ParsedDouyinItem[] = [];
  collectAwemeNodes(body, items);

  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.platformId)) return false;
    seen.add(item.platformId);
    return true;
  });
}

export function mergeParsedItems(
  existing: Map<string, ParsedDouyinItem>,
  incoming: ParsedDouyinItem[],
): void {
  for (const item of incoming) {
    if (!existing.has(item.platformId)) {
      existing.set(item.platformId, item);
    }
  }
}
