import {
  isValidDouyinVideoId,
  parseVideoIdFromHref,
} from "./url-utils.js";
import { resolveDouyinDisplayTitle } from "./title-utils.js";

export interface DomVideoItem {
  platformId: string;
  title?: string;
  href?: string;
}

/**
 * 纯字符串脚本，避免 tsx 向 page.evaluate 注入 __name 等 Node 辅助函数。
 */
export const EXTRACT_VIDEOS_SCRIPT = `() => {
  const results = [];
  const seen = new Set();

  function add(platformId, title, href) {
    if (!/^\\d{10,25}$/.test(platformId) || seen.has(platformId)) return;
    seen.add(platformId);
    results.push({
      platformId: platformId,
      title: title && title.trim() ? title.trim() : undefined,
      href: href,
    });
  }

  function parseHref(href) {
    const patterns = [
      /\\/video\\/(\\d{10,25})/,
      /modal_id=(\\d{10,25})/,
      /aweme_id=(\\d{10,25})/,
      /item_ids=(\\d{10,25})/,
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = href.match(patterns[i]);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function isNoiseText(text) {
    if (!text) return true;
    const t = text.trim();
    if (!t) return true;
    if (/^\\d+[万千亿]?$/.test(t)) return true;
    if (/^\\d{1,2}:\\d{2}$/.test(t)) return true;
    if (t === "详情" || t === "关注" || t === "点赞" || t === "收藏") return true;
    return false;
  }

  /** 从搜索卡片提取详情文案（含 #话题） */
  function pickCardDesc(card) {
    if (!card) return "";

    const selectors = [
      "[data-e2e='search-result-video-title']",
      "[data-e2e*='video-desc']",
      "[data-e2e*='desc']",
      "[class*='video-desc']",
      "[class*='desc']",
      "[class*='title']",
    ];

    for (let i = 0; i < selectors.length; i++) {
      const nodes = card.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const text = (nodes[j].textContent || "").replace(/\\s+/g, " ").trim();
        if (!isNoiseText(text) && text.length >= 2) return text;
      }
    }

    // 聚合卡片内带 # 的文本行
    const lines = [];
    const nodes = card.querySelectorAll("span, p, div, a");
    for (let i = 0; i < nodes.length; i++) {
      const text = (nodes[i].textContent || "").replace(/\\s+/g, " ").trim();
      if (!text || isNoiseText(text)) continue;
      if (text.indexOf("#") !== -1 || text.length >= 8) {
        lines.push(text);
      }
    }

    if (lines.length > 0) {
      lines.sort(function (a, b) { return b.length - a.length; });
      return lines[0];
    }

    return "";
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    return true;
  }

  const anchors = document.querySelectorAll("a[href]");
  for (let i = 0; i < anchors.length; i++) {
    const el = anchors[i];
    const href = el.href || el.getAttribute("href") || "";
    const id = parseHref(href);
    if (!id) continue;

    const card = el.closest(
      "li, [class*='card'], [class*='item'], [class*='search'], [data-e2e]"
    ) || el.parentElement;

    if (!isVisible(card) && !isVisible(el)) continue;

    const cardDesc = pickCardDesc(card);
    const anchorTitle = (el.getAttribute("title") || "").trim();
    const linkText = el.textContent ? el.textContent.replace(/\\s+/g, " ").trim() : "";

    // 详情（含 #话题）优先于链接 title 属性
    const title = cardDesc || anchorTitle || linkText;
    add(id, isNoiseText(title) ? cardDesc : title, href);
  }

  return results;
}`;

export type DomEvaluateScriptFn = <T>(script: string) => Promise<T>;

export async function extractVideosFromDom(
  evaluateScript: DomEvaluateScriptFn,
): Promise<DomVideoItem[]> {
  return evaluateScript(EXTRACT_VIDEOS_SCRIPT);
}

export function domItemsToParsed(
  domItems: DomVideoItem[],
): import("./network-parser.js").ParsedDouyinItem[] {
  return domItems
    .filter((item) => isValidDouyinVideoId(item.platformId))
    .map((item) => ({
      platformId: item.platformId,
      title: resolveDouyinDisplayTitle({ desc: item.title }, item.platformId),
    }));
}

export function parseVideoIdFromUrl(url: string): string | null {
  return parseVideoIdFromHref(url);
}
