import {
  extractDescMapFromText,
  isPlaceholderTitle,
  normalizeDouyinText,
  pickBetterTitle,
  resolveDouyinDisplayTitle,
} from "./title-utils.js";

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

function pickAwemeId(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && isValidDouyinVideoId(val.trim())) {
      return val.trim();
    }
    if (typeof val === "number" && Number.isSafeInteger(val)) {
      const asString = String(val);
      if (isValidDouyinVideoId(asString)) return asString;
    }
  }
  return "";
}

function pickScalarString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number" && Number.isFinite(val)) return String(val);
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

export function isValidDouyinVideoId(id: string): boolean {
  return /^\d{10,25}$/.test(id);
}

export function parseAwemeIdsFromText(text: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /"aweme_id"\s*:\s*"?(\d{10,25})"?/g,
    /"awemeId"\s*:\s*"?(\d{10,25})"?/g,
    /"group_id"\s*:\s*"?(\d{10,25})"?/g,
    /\/video\/(\d{10,25})/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] && isValidDouyinVideoId(match[1])) {
        ids.add(match[1]);
      }
    }
  }

  return Array.from(ids);
}

function parseAwemeNode(node: Record<string, unknown>): ParsedDouyinItem | null {
  const awemeInfo = asRecord(node.aweme_info) ?? node;
  const platformId = pickAwemeId(awemeInfo, "aweme_id", "awemeId", "group_id");
  if (!isValidDouyinVideoId(platformId)) return null;

  const authorObj = asRecord(awemeInfo.author);
  const stats = asRecord(awemeInfo.statistics) ?? asRecord(awemeInfo.stats);
  const shareInfo = asRecord(awemeInfo.share_info);

  const title = resolveDouyinDisplayTitle(
    {
      desc: awemeInfo.desc ?? awemeInfo.description,
      title: awemeInfo.title ?? shareInfo?.share_title,
      content: awemeInfo.content,
      textExtra: awemeInfo.text_extra ?? awemeInfo.textExtra,
    },
    platformId,
  );

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
          id: pickScalarString(authorObj, "uid", "sec_uid") || undefined,
          name: pickScalarString(authorObj, "nickname", "unique_id") || undefined,
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
    "mix_list",
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
    if (!isValidDouyinVideoId(item.platformId) || seen.has(item.platformId)) {
      return false;
    }
    seen.add(item.platformId);
    return true;
  });
}

/** 仅解析顶层列表字段，保持接口返回顺序，不递归扫全 JSON */
export function parseDouyinSearchResponseOrdered(text: string): ParsedDouyinItem[] {
  try {
    const json = JSON.parse(text) as unknown;
    return parseDouyinSearchListResponse(json);
  } catch {
    return [];
  }
}

function parseDouyinSearchListResponse(body: unknown): ParsedDouyinItem[] {
  const record = asRecord(body);
  if (!record) return [];

  const items: ParsedDouyinItem[] = [];
  const seen = new Set<string>();
  const listKeys = [
    "aweme_list",
    "data",
    "item_list",
    "items",
    "business_data",
  ];

  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;

    for (const node of list) {
      const nodeRecord = asRecord(node);
      if (!nodeRecord) continue;

      const parsed =
        parseAwemeNode(nodeRecord) ??
        parseAwemeNode(asRecord(nodeRecord.aweme_info) ?? {});

      if (
        !parsed ||
        !isValidDouyinVideoId(parsed.platformId) ||
        seen.has(parsed.platformId)
      ) {
        continue;
      }

      seen.add(parsed.platformId);
      items.push(parsed);
    }
  }

  return items;
}

export function parseDouyinSearchResponseText(text: string): ParsedDouyinItem[] {
  const descMap = extractDescMapFromText(text);
  const byId = new Map<string, ParsedDouyinItem>();

  for (const id of parseAwemeIdsFromText(text)) {
    const desc = descMap.get(id);
    byId.set(id, {
      platformId: id,
      title: desc
        ? resolveDouyinDisplayTitle({ desc }, id)
        : `抖音视频 ${id}`,
    });
  }

  try {
    const json = JSON.parse(text) as unknown;
    for (const item of parseDouyinSearchResponse(json)) {
      const existing = byId.get(item.platformId);
      if (!existing) {
        byId.set(item.platformId, item);
        continue;
      }
      byId.set(item.platformId, {
        ...item,
        title: pickBetterTitle(existing.title, item.title, item.platformId),
      });
    }
  } catch {
    // regex-only path
  }

  return Array.from(byId.values());
}

export function mergeNetworkOrder(
  existing: string[],
  incoming: ParsedDouyinItem[],
): string[] {
  const order = [...existing];
  const seen = new Set(order);
  for (const item of incoming) {
    if (!isValidDouyinVideoId(item.platformId) || seen.has(item.platformId)) {
      continue;
    }
    seen.add(item.platformId);
    order.push(item.platformId);
  }
  return order;
}

export function mergeParsedItems(
  existing: Map<string, ParsedDouyinItem>,
  incoming: ParsedDouyinItem[],
): void {
  for (const item of incoming) {
    if (!isValidDouyinVideoId(item.platformId)) continue;
    const prev = existing.get(item.platformId);
    if (!prev) {
      existing.set(item.platformId, item);
      continue;
    }
    existing.set(item.platformId, {
      ...item,
      title: pickBetterTitle(prev.title, item.title, item.platformId),
      author: item.author ?? prev.author,
      metrics: item.metrics ?? prev.metrics,
      publishedAt: item.publishedAt ?? prev.publishedAt,
    });
  }
}

export { isPlaceholderTitle, normalizeDouyinText };
