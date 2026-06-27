-- Migration: 002_schema_comments
-- Service:  content-discovery-service
-- Database: content_discovery
-- Purpose:  表/字段语义注释（PostgreSQL COMMENT，可被 tbls 等工具导出）

COMMENT ON TABLE search_runs IS '一次内容搜索/发现任务的运行记录';
COMMENT ON COLUMN search_runs.id IS '运行 UUID，content_items.run_id 外键';
COMMENT ON COLUMN search_runs.platform IS '平台：douyin | xiaohongshu | kuaishou | x | weibo';
COMMENT ON COLUMN search_runs.mode IS '搜索模式：keyword | trending';
COMMENT ON COLUMN search_runs.keyword IS '关键词；mode=keyword 时有值';
COMMENT ON COLUMN search_runs.filters IS '平台筛选 JSON，结构见 Projects/schemas/db/content-discovery/search-filters.schema.json';
COMMENT ON COLUMN search_runs.limit_count IS '请求的最大结果条数';
COMMENT ON COLUMN search_runs.success IS '是否成功完成';
COMMENT ON COLUMN search_runs.partial IS '结果不足 limit 但未失败时为 true';
COMMENT ON COLUMN search_runs.actual_count IS '实际写入 content_items 的条数';
COMMENT ON COLUMN search_runs.duration_ms IS '任务耗时（毫秒）';
COMMENT ON COLUMN search_runs.warnings IS '非致命警告字符串数组 JSON';
COMMENT ON COLUMN search_runs.created_at IS '任务开始/记录创建时间';

COMMENT ON TABLE content_items IS '单次 search_run 产出的统一内容条目';
COMMENT ON COLUMN content_items.run_id IS '所属 search_runs.id';
COMMENT ON COLUMN content_items.platform IS '内容来源平台';
COMMENT ON COLUMN content_items.content_type IS 'video | image_text | article | thread';
COMMENT ON COLUMN content_items.rank IS '本次结果中的排序位（从 1 起）';
COMMENT ON COLUMN content_items.share_url IS '分享链接（短链或带参链接）';
COMMENT ON COLUMN content_items.canonical_url IS '规范化后的页面 URL';
COMMENT ON COLUMN content_items.platform_id IS '平台内内容 ID；与 platform 组合可跨服务引用';
COMMENT ON COLUMN content_items.author_id IS '作者平台 ID';
COMMENT ON COLUMN content_items.author_name IS '作者显示名';
COMMENT ON COLUMN content_items.likes IS '点赞数（抓取时刻）';
COMMENT ON COLUMN content_items.views IS '播放/阅读数（抓取时刻）';
COMMENT ON COLUMN content_items.comments IS '评论数（抓取时刻）';
COMMENT ON COLUMN content_items.published_at IS '内容发布时间';
COMMENT ON COLUMN content_items.fetched_at IS '本条目抓取时间';
