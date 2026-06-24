export function isValidDouyinVideoId(id: string): boolean {
  return /^\d{10,25}$/.test(id);
}

export function parseVideoIdFromHref(href: string): string | null {
  const patterns = [
    /\/video\/(\d{10,25})/,
    /modal_id=(\d{10,25})/,
    /aweme_id=(\d{10,25})/,
    /item_ids=(\d{10,25})/,
  ];
  for (const pattern of patterns) {
    const match = href.match(pattern);
    if (match?.[1] && isValidDouyinVideoId(match[1])) {
      return match[1];
    }
  }
  return null;
}

export function buildCanonicalVideoUrl(platformId: string): string {
  return `https://www.douyin.com/video/${platformId}`;
}
