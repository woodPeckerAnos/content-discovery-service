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
 *
 * 只从可见的搜索结果区采集（scroll-list 或 waterfall），避免：
 * - 隐藏瀑布流里的旧数据
 * - 页面顶部推荐/导航区的 /video/ 链接
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
    if (t === "暂时没有更多了") return true;
    return false;
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

  function isVisibleTree(el) {
    let node = el;
    while (node && node !== document.body) {
      if (!isVisible(node)) return false;
      node = node.parentElement;
    }
    return true;
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
    ];

    for (let i = 0; i < selectors.length; i++) {
      const nodes = card.querySelectorAll(selectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const text = (nodes[j].textContent || "").replace(/\\s+/g, " ").trim();
        if (!isNoiseText(text) && text.length >= 2) return text;
      }
    }

    const lines = [];
    const nodes = card.querySelectorAll("span, p, div");
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

  function extractFromCard(card, hrefOverride, idOverride) {
    if (!card || !isVisibleTree(card)) return;

    let href = hrefOverride || "";
    let id = idOverride || "";

    if (!id && href) {
      id = parseHref(href) || "";
    }

    if (!id) {
      const anchor = card.querySelector("a[href]");
      if (anchor) {
        href = anchor.href || anchor.getAttribute("href") || "";
        id = parseHref(href) || "";
      }
    }

    if (!id) return;

    const cardDesc = pickCardDesc(card);
    const anchor = card.querySelector("a[href*='/video/'], a[href*='modal_id=']");
    const anchorTitle = anchor
      ? (anchor.getAttribute("title") || "").trim()
      : "";
    const linkText = anchor && anchor.textContent
      ? anchor.textContent.replace(/\\s+/g, " ").trim()
      : "";

    const title = cardDesc || anchorTitle || linkText;
    add(id, isNoiseText(title) ? cardDesc : title, href);
  }

  const root =
    document.querySelector("#search-result-container") ||
    document.querySelector("[id*='search-result']") ||
    document.body;

  const scrollList = root.querySelector('ul[data-e2e="scroll-list"]');
  if (scrollList && isVisibleTree(scrollList)) {
    const items = scrollList.querySelectorAll(":scope > li");
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      if (!isVisibleTree(li)) continue;
      const card = li.querySelector(".search-result-card") || li;
      const anchor = card.querySelector("a[href]");
      const href = anchor
        ? anchor.href || anchor.getAttribute("href") || ""
        : "";
      extractFromCard(card, href, null);
    }
    return results;
  }

  const waterfallItems = root.querySelectorAll('div[id^="waterfall_item_"]');
  const visibleWaterfall = [];
  for (let i = 0; i < waterfallItems.length; i++) {
    const item = waterfallItems[i];
    if (!isVisibleTree(item)) continue;
    const idMatch = item.id.match(/^waterfall_item_(\\d{10,25})$/);
    if (!idMatch) continue;
    const style = item.getAttribute("style") || "";
    const translateMatch = style.match(/translate\\(\\s*([\\d.]+)px\\s*,\\s*([\\d.]+)px\\s*\\)/);
    const sortY = translateMatch ? Number(translateMatch[2]) : i * 1000;
    const sortX = translateMatch ? Number(translateMatch[1]) : 0;
    visibleWaterfall.push({ item: item, id: idMatch[1], sortY: sortY, sortX: sortX });
  }

  if (visibleWaterfall.length > 0) {
    visibleWaterfall.sort(function (a, b) {
      if (a.sortY !== b.sortY) return a.sortY - b.sortY;
      return a.sortX - b.sortX;
    });
    for (let i = 0; i < visibleWaterfall.length; i++) {
      const entry = visibleWaterfall[i];
      const card = entry.item.querySelector(".search-result-card") || entry.item;
      extractFromCard(card, null, entry.id);
    }
    return results;
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

export function mergeDomOrder(
  existingOrder: string[],
  domItems: DomVideoItem[],
): string[] {
  const order = [...existingOrder];
  const seen = new Set(order);
  for (const item of domItems) {
    if (!isValidDouyinVideoId(item.platformId) || seen.has(item.platformId)) {
      continue;
    }
    seen.add(item.platformId);
    order.push(item.platformId);
  }
  return order;
}

export function parseVideoIdFromUrl(url: string): string | null {
  return parseVideoIdFromHref(url);
}
