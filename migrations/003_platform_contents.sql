-- Migration: 003_platform_contents
-- Service:  content-discovery-service
-- Database: content_discovery
-- Purpose:  引入跨搜索的平台内容主表，并从历史 content_items 回填
-- Breaking: 否（仅加表 + INSERT，不改现有列）

CREATE TABLE IF NOT EXISTS platform_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  share_url TEXT NOT NULL,
  canonical_url TEXT,
  author_id TEXT,
  author_name TEXT,
  likes INT,
  views INT,
  comments INT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_platform_contents_natural UNIQUE (platform, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_contents_platform_last_seen
  ON platform_contents (platform, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_contents_content_type
  ON platform_contents (platform, content_type);

-- 从已有 content_items 回填（取每个 platform_id 最新 fetched_at 的一行）
INSERT INTO platform_contents (
  platform,
  platform_id,
  content_type,
  title,
  share_url,
  canonical_url,
  author_id,
  author_name,
  likes,
  views,
  comments,
  published_at,
  first_seen_at,
  last_seen_at,
  seen_count
)
SELECT DISTINCT ON (platform, platform_id)
  platform,
  platform_id,
  content_type,
  title,
  share_url,
  canonical_url,
  author_id,
  author_name,
  likes,
  views,
  comments,
  published_at,
  fetched_at,
  fetched_at,
  1
FROM content_items
ORDER BY platform, platform_id, fetched_at DESC
ON CONFLICT (platform, platform_id) DO NOTHING;

-- 修正 seen_count / first_seen_at（有历史重复行时）
UPDATE platform_contents pc
SET
  seen_count = sub.cnt,
  first_seen_at = sub.first_at,
  last_seen_at = sub.last_at
FROM (
  SELECT
    platform,
    platform_id,
    COUNT(*)::INT AS cnt,
    MIN(fetched_at) AS first_at,
    MAX(fetched_at) AS last_at
  FROM content_items
  GROUP BY platform, platform_id
) sub
WHERE pc.platform = sub.platform
  AND pc.platform_id = sub.platform_id;
