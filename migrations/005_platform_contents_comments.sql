-- Migration: 005_platform_contents_comments
-- Service:  content-discovery-service
-- Database: content_discovery
-- Purpose:  platform_contents 及 content_items 新列 COMMENT ON
-- Depends:  003_platform_contents.sql, 004_content_items_platform_fk.sql

COMMENT ON TABLE platform_contents IS '跨 search_run 的平台内容实体；业务键 (platform, platform_id)';

COMMENT ON COLUMN platform_contents.id IS '库内 UUID；content_items.platform_content_id 外键';
COMMENT ON COLUMN platform_contents.platform IS '平台：douyin | xiaohongshu | kuaishou | x | weibo';
COMMENT ON COLUMN platform_contents.platform_id IS '平台内内容 ID；与 platform 组合为跨服务引用键';
COMMENT ON COLUMN platform_contents.content_type IS 'video | image_text | article | thread';
COMMENT ON COLUMN platform_contents.title IS '最新标题（discovery upsert 时更新）';
COMMENT ON COLUMN platform_contents.share_url IS '最新分享链接';
COMMENT ON COLUMN platform_contents.canonical_url IS '最新规范化 URL';
COMMENT ON COLUMN platform_contents.author_id IS '作者平台 ID（最新）';
COMMENT ON COLUMN platform_contents.author_name IS '作者显示名（最新）';
COMMENT ON COLUMN platform_contents.likes IS '点赞数（最新抓取）';
COMMENT ON COLUMN platform_contents.views IS '播放/阅读数（最新抓取）';
COMMENT ON COLUMN platform_contents.comments IS '评论数（最新抓取）';
COMMENT ON COLUMN platform_contents.published_at IS '内容发布时间';
COMMENT ON COLUMN platform_contents.first_seen_at IS '首次被 discovery 发现时间';
COMMENT ON COLUMN platform_contents.last_seen_at IS '最近一次被 discovery 命中时间';
COMMENT ON COLUMN platform_contents.seen_count IS '被 discovery 命中累计次数';
COMMENT ON COLUMN platform_contents.created_at IS '行创建时间';
COMMENT ON COLUMN platform_contents.updated_at IS '行最后更新时间';

COMMENT ON COLUMN content_items.platform_content_id IS '关联 platform_contents.id';
COMMENT ON COLUMN content_items.title_at_discovery IS '本次 search_run 发现时的标题快照';
