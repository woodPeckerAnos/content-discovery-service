# content-discovery-service — 数据库

## 概览

| 项 | 值 |
| :--- | :--- |
| 数据库名 | `content_discovery` |
| SSOT | [`migrations/`](../migrations/) |
| 连接（容器内） | `postgres://dev:changeme@postgres:5432/content_discovery` |

## ER 关系

```text
search_runs (1) ──< content_items (N)
     id              run_id → search_runs.id (ON DELETE CASCADE)
```

## 表说明

### `search_runs`

一次关键词/热门搜索任务的元数据与统计。

**状态含义：**

- `success = false`：任务失败，通常无或少量 `content_items`
- `partial = true`：成功但 `actual_count < limit_count`

### `content_items`

单次 run 产出的标准化内容条目，字段与 [`src/types/content.ts`](../src/types/content.ts) 中 `UnifiedContentItem` 对应。

**下游：** `platform_id` + `platform` 可被 douyin-comment / douyin-transcript 引用。

## JSONB 字段

| 列 | 文档 |
| :--- | :--- |
| `filters` | [`Projects/schemas/db/content-discovery/search-filters.schema.json`](../../schemas/db/content-discovery/search-filters.schema.json) |
| `warnings` | 字符串数组，如 `["结果不足，已重试"]` |

## 迁移历史

| 文件 | 说明 |
| :--- | :--- |
| `001_init.sql` | 初始表与索引 |
| `002_schema_comments.sql` | PostgreSQL COMMENT ON |

## 本地调试

```bash
docker exec -it postgres psql -U dev -d content_discovery -c '\dt'
docker exec -it postgres psql -U dev -d content_discovery -c '\d+ search_runs'
```
