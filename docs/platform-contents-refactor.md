# platform_contents 数据库改造方案

> 状态：**Phase 1–3 已实施**（migration + `db-result-store` upsert）；Phase 5–6 可选  
> 服务：`content-discovery-service`  
> 数据库：`content_discovery`

## 1. 背景与问题

### 现状

```text
search_runs (1) ──< content_items (N)
```

- `content_items` 同时承担 **「平台内容实体」** 与 **「某次搜索的发现快照」** 两种语义。
- 同一 `(platform, platform_id)` 在不同 `run_id` 下会 **重复多行**。
- 按「视频维度」查询、挂接转录/评论流水线时，需要先 `DISTINCT ON (platform, platform_id)`，不便维护。
- 转录/ASR 已在 **`douyin_transcript.transcripts`**（`video_id` = `platform_id`），不宜再写入 discovery 库造成双源。

### 目标

1. 引入 **平台内容主表** `platform_contents`：跨搜索、跨任务的唯一实体。
2. `content_items` 收窄为 **搜索发现记录**（保留 rank、当次快照指标）。
3. **不迁移** 转录正文到本库；通过 `(platform, platform_id)` 与 transcript 服务关联。
4. **不破坏** 现有跨服务契约（comment / transcript 仍用 `platform_id` / `share_url`）。

---

## 2. 目标模型

```text
search_runs (1) ──< content_items (N) ──> platform_contents (1)
                                              │
                    （逻辑关联，跨库）         │
                                              ▼
                              douyin_transcript.transcripts (video_id)
                              douyin_comment … (video_id)
```

| 表 | 职责 | 业务唯一键 |
|----|------|------------|
| `search_runs` | 一次搜索任务元数据 | `id` (UUID) |
| `platform_contents` | 平台上的内容实体（最新 meta） | `(platform, platform_id)` |
| `content_items` | 某次 run 的发现行（排名 + 快照） | `(run_id, platform_content_id)` |
| `transcripts`（他库） | 文案 / ASR | `video_id` |

### 字段分层原则

| 数据 | 存哪里 | 说明 |
|------|--------|------|
| 稳定标识 | `platform_contents` | `platform`, `platform_id`, `content_type` |
| 常变 meta（最新） | `platform_contents` | `title`, `share_url`, `canonical_url`, 作者, 最新 metrics |
| 发现上下文 | `content_items` | `run_id`, `rank`, `title_at_discovery`, 当次 metrics |
| 转录正文 | `douyin_transcript` | `text`, `asr`, `description` |
| 评论明细 | `douyin_comment` | 各服务自有表 |

---

## 3. 表结构草案

### 3.1 `platform_contents`（新建）

```sql
CREATE TABLE platform_contents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        TEXT NOT NULL,
  platform_id     TEXT NOT NULL,
  content_type    TEXT NOT NULL,

  -- 最新 meta（每次 discovery upsert 更新）
  title           TEXT NOT NULL,
  share_url       TEXT NOT NULL,
  canonical_url   TEXT,
  author_id       TEXT,
  author_name     TEXT,
  likes           INT,
  views           INT,
  comments        INT,
  published_at    TIMESTAMPTZ,

  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count      INT NOT NULL DEFAULT 1,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_platform_contents_natural
    UNIQUE (platform, platform_id)
);

CREATE INDEX idx_platform_contents_platform
  ON platform_contents (platform, last_seen_at DESC);

CREATE INDEX idx_platform_contents_content_type
  ON platform_contents (platform, content_type);
```

**说明：**

- `id`：库内 UUID，供 `content_items` 外键；对外集成仍用 `platform + platform_id`。
- `seen_count` / `first_seen_at` / `last_seen_at`：统计被 discovery 命中次数，便于选题分析。
- 后续可加 `enrichment_status JSONB`（仅 pipeline 状态，不存正文），见 §6。

### 3.2 `content_items`（改造）

**Phase A — 加列，保留旧列（兼容期）**

```sql
ALTER TABLE content_items
  ADD COLUMN platform_content_id UUID
    REFERENCES platform_contents(id) ON DELETE RESTRICT;

ALTER TABLE content_items
  ADD COLUMN title_at_discovery TEXT;

CREATE UNIQUE INDEX uq_content_items_run_content
  ON content_items (run_id, platform_content_id)
  WHERE platform_content_id IS NOT NULL;
```

**Phase B — 稳定后（可选）**

- `platform`, `platform_id`, `title`, `share_url` 等可从 `content_items` **只读冗余** 或 **逐步删除**。
- 建议至少 **保留 `platform_id`** 一列至 v2，避免下游 SQL 大面积改动。

### 3.3 可选：`content_enrichment_refs`（Phase 3，非必须）

仅记录「某 platform_content 在各下游的处理状态」，**不存 transcript 文本**：

```sql
CREATE TABLE content_enrichment_refs (
  platform_content_id UUID NOT NULL
    REFERENCES platform_contents(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,  -- transcript | comments
  status              TEXT NOT NULL,  -- pending | done | failed
  external_ref        TEXT,           -- 如 douyin_transcript 批次 id
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_content_id, kind)
);
```

---

## 4. 写入流程（应用层）

### 4.1 单次 discovery 写入（伪代码）

```text
BEGIN
  INSERT search_runs … RETURNING run_id

  FOR EACH item IN search_results:
    platform_content_id = UPSERT platform_contents
      ON CONFLICT (platform, platform_id) DO UPDATE
        SET title, share_url, metrics…, last_seen_at, seen_count+1, updated_at

    INSERT content_items
      (run_id, platform_content_id, rank,
       title_at_discovery, …快照 metrics…,
       platform, platform_id, …)  -- 兼容期保留冗余列
COMMIT
```

### 4.2 Upsert SQL 示例

```sql
INSERT INTO platform_contents (
  platform, platform_id, content_type,
  title, share_url, canonical_url,
  author_id, author_name, likes, views, comments, published_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (platform, platform_id) DO UPDATE SET
  content_type   = EXCLUDED.content_type,
  title          = EXCLUDED.title,
  share_url      = EXCLUDED.share_url,
  canonical_url  = EXCLUDED.canonical_url,
  author_id      = EXCLUDED.author_id,
  author_name    = EXCLUDED.author_name,
  likes          = EXCLUDED.likes,
  views          = EXCLUDED.views,
  comments       = EXCLUDED.comments,
  published_at   = EXCLUDED.published_at,
  last_seen_at   = now(),
  seen_count     = platform_contents.seen_count + 1,
  updated_at     = now()
RETURNING id;
```

### 4.3 代码改动范围（`content-discovery-service`）

| 文件 | 改动 |
|------|------|
| `src/services/db-result-store.ts` | upsert `platform_contents` + 写 `content_items.platform_content_id` |
| `src/types/content.ts` | 可选增加 `platformContentId` |
| `migrations/003_*.sql` | 建表 + 回填 |
| `migrations/004_*.sql` | `content_items` 加 FK + 回填 |
| `migrations/005_*.sql` | COMMENT ON |
| `docs/database.md` | 更新 ER |

---

## 5. 数据迁移（已有库）

### Step 1：建表并回填 `platform_contents`

从现有 `content_items` 按 `(platform, platform_id)` 去重，取 **最新 `fetched_at`** 一行作为 meta：

```sql
INSERT INTO platform_contents (
  platform, platform_id, content_type,
  title, share_url, canonical_url,
  author_id, author_name, likes, views, comments, published_at,
  first_seen_at, last_seen_at, seen_count
)
SELECT DISTINCT ON (platform, platform_id)
  platform, platform_id, content_type,
  title, share_url, canonical_url,
  author_id, author_name, likes, views, comments, published_at,
  fetched_at, fetched_at, 1
FROM content_items
ORDER BY platform, platform_id, fetched_at DESC;
```

### Step 2：回填 `content_items.platform_content_id`

```sql
UPDATE content_items ci
SET platform_content_id = pc.id
FROM platform_contents pc
WHERE ci.platform = pc.platform
  AND ci.platform_id = pc.platform_id;
```

### Step 3：修正 `seen_count`

```sql
UPDATE platform_contents pc
SET seen_count = sub.cnt,
    first_seen_at = sub.first_at
FROM (
  SELECT platform, platform_id,
         COUNT(*) AS cnt,
         MIN(fetched_at) AS first_at
  FROM content_items
  GROUP BY platform, platform_id
) sub
WHERE pc.platform = sub.platform
  AND pc.platform_id = sub.platform_id;
```

### Step 4（可选）：`title_at_discovery`

```sql
UPDATE content_items SET title_at_discovery = title;
```

---

## 6. 与转录 / 评论服务的关系

### 原则：**正文不进 discovery 库**

| 能力 | 存放位置 | 关联键 |
|------|----------|--------|
| 文案 / ASR | `douyin_transcript.transcripts` | `video_id` = `platform_contents.platform_id` |
| 评论 | `douyin_comment` 各表 | 同上 |
| Discovery meta | `platform_contents` | — |

### 推荐查询（应用层两次查询或 PG FDW 未来再做）

```sql
-- content_discovery 库
SELECT pc.platform_id, pc.title, pc.share_url
FROM platform_contents pc
WHERE pc.platform = 'douyin'
ORDER BY pc.last_seen_at DESC
LIMIT 50;

-- douyin_transcript 库（由调度/脚本按 platform_id 列表拉取）
SELECT video_id, text, recognized_at
FROM transcripts
WHERE video_id = ANY($1);
```

### 跨服务契约更新（`Projects/schemas/db/README.md`）

| 字段 | 产出方 | 消费方 | 说明 |
|------|--------|--------|------|
| `platform_contents.platform` + `platform_id` | content-discovery | comment / transcript | **推荐**；与现契约等价 |
| `platform_contents.id` | content-discovery | 仅库内 FK | 不对外暴露亦可 |
| `content_items`（run 维度） | content-discovery | 内部分析 | 某次搜索第几名 |

---

## 7. 分阶段落地计划

| Phase | 内容 | Breaking | 预估 |
|-------|------|----------|------|
| **0** | 评审本文档 | 无 | — |
| **1** | `003_platform_contents.sql` 建表 + 回填 + 新写入双写 | 无 | ✅ |
| **2** | `004_content_items_fk.sql` 加 FK、`title_at_discovery` | 无 | ✅ |
| **3** | 改 `db-result-store` 走 upsert 路径 | 无 | ✅ |
| **4** | 更新 `docs/database.md`、schemas README、tbls | 无 | 部分 |
| **5**（可选） | `content_enrichment_refs` + 调度状态回写 | 无 | 中 |
| **6**（可选） | 删除 `content_items` 冗余列 | **有** | 大，需下游确认 |

**建议：Phase 1–4 先上生产；Phase 6 至少保留一个 major 版本的兼容列。**

---

## 8. 回滚策略

- Phase 1–2 仅 **加表/加列**，回滚 = 停止写新列 + 应用仍读旧列。
- 不在 Phase 1 删除任何现有列。
- Migration 按编号追加，**禁止改** `001_init.sql`。

---

## 9. 开放问题（评审时决定）

1. **`platform_contents.id` 是否对外 API 暴露？** 建议否，继续用 `platform + platform_id`。
2. **metrics 存 latest only 还是 history 表？** 首版 only；若要做趋势再加 `content_metrics_snapshots`。
3. **`content_items` 冗余列何时删？** 建议下游全改 join 后再删。
4. **多平台图文/文章** 是否共用 `platform_contents`？ 是，靠 `content_type` 区分。

---

## 10. Migration 文件清单（待实施）

| 文件 | 说明 |
|------|------|
| [`migrations/003_platform_contents.sql`](../migrations/003_platform_contents.sql) | 建表 + 自 `content_items` 回填 |
| [`migrations/004_content_items_platform_fk.sql`](../migrations/004_content_items_platform_fk.sql) | FK + 索引 + `title_at_discovery` |
| [`migrations/005_platform_contents_comments.sql`](../migrations/005_platform_contents_comments.sql) | COMMENT ON |

实施顺序：应用 migration → 部署新写路径 → 验证 → 文档/tbls  regeneration。

---

## 11. 验收标准

- [x] 同一 `(platform, platform_id)` 在 `platform_contents` 仅一行（migration 003 + upsert）
- [x] 新 search run 写入后 `content_items.platform_content_id` 非空（`db-result-store`）
- [x] `seen_count` 随重复发现递增（upsert ON CONFLICT）
- [x] 现有 comment / transcript 集成无需改键即可工作（冗余列保留）
- [ ] 手工跑一条 search 后 DB 抽查通过（需本地 Postgres）
