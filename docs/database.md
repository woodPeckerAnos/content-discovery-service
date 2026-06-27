# content-discovery-service — 数据库

## 概览

| 项 | 值 |
| :--- | :--- |
| 数据库名 | `content_discovery` |
| SSOT | [`migrations/`](../migrations/) |
| 连接（容器内） | `postgres://dev:changeme@postgres:5432/content_discovery` |
| 连接（宿主机） | `postgres://dev:changeme@127.0.0.1:5433/content_discovery`（Docker `POSTGRES_PORT=5433`，避免与本机 Postgres 5432 冲突） |

## ER 关系

```text
search_runs (1) ──< content_items (N) ──> platform_contents (1)
     id              run_id                    id
                     platform_content_id ────────┘
                     platform + platform_id（兼容 / 跨服务引用）
```

设计说明：[platform-contents-refactor.md](./platform-contents-refactor.md)

## 表说明

### `search_runs`

一次关键词/热门搜索任务的元数据与统计。

**状态含义：**

- `success = false`：任务失败，通常无或少量 `content_items`
- `partial = true`：成功但 `actual_count < limit_count`

### `platform_contents`

跨 `search_run` 的平台内容实体；业务键 `(platform, platform_id)`。每次 discovery 写入时 upsert，更新最新 meta 并递增 `seen_count`。

### `content_items`

单次 run 的发现快照：排名、当次标题（`title_at_discovery`）、当次 metrics；通过 `platform_content_id` 关联主表。冗余 `platform` / `platform_id` 等列保留，兼容下游。

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
| `003_platform_contents.sql` | 平台内容主表 + 历史回填 |
| `004_content_items_platform_fk.sql` | content_items → platform_contents FK |
| `005_platform_contents_comments.sql` | 新表/新列 COMMENT |

## 本地调试

```bash
# 应用 migration（宿主机 5432 若被本机 Postgres 占用，请用 Docker 脚本）
npm run db:migrate

# 或进入 Docker 内 psql
docker exec -it postgres psql -U dev -d content_discovery -c '\dt'
docker exec -it postgres psql -U dev -d content_discovery -c '\d+ platform_contents'
docker exec -it postgres psql -U dev -d content_discovery -c \
  "SELECT pc.platform_id, pc.seen_count, pc.title FROM platform_contents pc ORDER BY pc.last_seen_at DESC LIMIT 5;"
```
