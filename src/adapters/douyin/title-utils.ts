/**
 * 抖音展示标题：优先 desc（详情，含 #tag），其次 title 字段，最后占位符。
 */

function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function normalizeDouyinText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

export function isPlaceholderTitle(title: string, platformId: string): boolean {
  const t = normalizeDouyinText(title);
  if (!t) return true;
  if (t === platformId) return true;
  return t === `抖音视频 ${platformId}`;
}

interface TextExtraItem {
  hashtag_name?: string;
  hashtag_id?: string;
  type?: number;
}

export function buildDescFromTextExtra(textExtra: unknown): string {
  if (!Array.isArray(textExtra)) return "";
  const tags: string[] = [];
  for (const entry of textExtra) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as TextExtraItem;
    const name = normalizeDouyinText(item.hashtag_name);
    if (!name) continue;
    tags.push(name.startsWith("#") ? name : `#${name}`);
  }
  return tags.join(" ");
}

export function resolveDouyinDisplayTitle(
  input: {
    desc?: unknown;
    title?: unknown;
    content?: unknown;
    textExtra?: unknown;
  },
  platformId: string,
): string {
  const desc = normalizeDouyinText(input.desc);
  const title = normalizeDouyinText(input.title);
  const content = normalizeDouyinText(input.content);
  const fromTags = buildDescFromTextExtra(input.textExtra);

  // desc 即抖音「详情」，通常已包含 #话题
  if (desc) return desc;
  if (title) return title;
  if (content) return content;
  if (fromTags) return fromTags;

  return `抖音视频 ${platformId}`;
}

export function pickBetterTitle(
  current: string,
  incoming: string,
  platformId: string,
): string {
  const curPlaceholder = isPlaceholderTitle(current, platformId);
  const incPlaceholder = isPlaceholderTitle(incoming, platformId);

  if (curPlaceholder && !incPlaceholder) return incoming;
  if (!curPlaceholder && incPlaceholder) return current;
  if (!curPlaceholder && !incPlaceholder) {
    return incoming.length > current.length ? incoming : current;
  }
  return incoming || current;
}

/** 从 API 原始 JSON 文本中配对 aweme_id 与 desc */
export function extractDescMapFromText(text: string): Map<string, string> {
  const map = new Map<string, string>();

  const blockPattern =
    /"aweme_id"\s*:\s*"?(\d{10,25})"?[\s\S]{0,4000}?"desc"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  for (const match of text.matchAll(blockPattern)) {
    const id = match[1];
    const desc = normalizeDouyinText(unescapeJsonString(match[2]));
    if (!id || !desc) continue;
    const prev = map.get(id);
    if (!prev || desc.length > prev.length) {
      map.set(id, desc);
    }
  }

  return map;
}
