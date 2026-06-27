-- Migration: 004_content_items_platform_fk
-- Service:  content-discovery-service
-- Database: content_discovery
-- Purpose:  content_items 关联 platform_contents；保留原列以兼容下游
-- Breaking: 否（加列 + 回填，不删列）
-- Depends:  003_platform_contents.sql

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS platform_content_id UUID
    REFERENCES platform_contents(id) ON DELETE RESTRICT;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS title_at_discovery TEXT;

UPDATE content_items ci
SET platform_content_id = pc.id
FROM platform_contents pc
WHERE ci.platform_content_id IS NULL
  AND ci.platform = pc.platform
  AND ci.platform_id = pc.platform_id;

UPDATE content_items
SET title_at_discovery = title
WHERE title_at_discovery IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_items_run_platform_content
  ON content_items (run_id, platform_content_id)
  WHERE platform_content_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_platform_content_id
  ON content_items (platform_content_id);
