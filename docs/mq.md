# 消息队列集成（job-queue / Redis Streams）

本服务在 **PC 宿主机** 运行 Worker，消费 **`search`** 域队列；调度由 [`job-scheduler`](../../job-scheduler/) 负责。

## 架构

```text
Docker / Scheduler              PC 宿主机 (search worker)
┌──────────────────┐           ┌─────────────────────────────┐
│ job-scheduler    │──XADD──►  │  QUEUE_NAME=search          │
│ search:stream    │  Redis    │  npm run worker             │
└──────────────────┘           │  content-discovery-service  │
                               └──────────────┬──────────────┘
                                              │ pipeline XADD
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
         comments-douyin:stream                              transcript:stream
                    │                                                   │
                    ▼                                                   ▼
         douyin-comment-service                            douyin-transcript-service
```

协议详见 [`job-queue/PROTOCOL.md`](../../job-queue/PROTOCOL.md)。

## 职责划分

| 组件 | 职责 |
|------|------|
| **Scheduler** | 到点向 `search:stream` 投递 `douyin_search`，payload 仅含 `runLabel` |
| **本服务** | 按 `runLabel` 读取 `config/search-profiles.yaml` 中的关键词与筛选条件 |
| **本服务（搜索完成后）** | 向 `comments-douyin` / `transcript` 队列投递 pipeline 任务 |

关键词等强业务配置 **不在队列消息中**，由本服务维护。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `REDIS_HOST` | `127.0.0.1` | Redis |
| `REDIS_PORT` | `6379` | |
| `QUEUE_NAME` | `search` | 本 Worker 消费的域队列 |
| `WORKER_CONCURRENCY` | `1` | **建议 1**（共用浏览器 Profile） |
| `SEARCH_PROFILES_PATH` | `config/search-profiles.yaml` | 搜索关键词配置 |
| `COMMENTS_QUEUE_NAME` | `comments-douyin` | 评论任务目标队列 |
| `TRANSCRIPT_QUEUE_NAME` | `transcript` | 转写任务目标队列 |
| `DISPATCH_PIPELINE_JOBS` | `true` | 设为 `false` 可仅跑搜索、不派发下游 |

另需本服务原有变量：`LLM_API_KEY`、`DATABASE_URL`（可选）、浏览器相关配置等。

## 1. 在 job-scheduler 定义定时任务

编辑 [`job-scheduler/jobs.yaml`](../../job-scheduler/jobs.yaml)：

```yaml
jobs:
  - name: douyin_search_crystal        # scheduler 唯一 id（手动触发 API 路径）
    jobName: douyin_search             # 写入 Redis 的 wire jobName
    queue: search
    cron: "0 9 * * *"
    payload:
      runLabel: crystal
```

`runLabel` 须与 [`config/search-profiles.yaml`](../config/search-profiles.yaml) 中的 profile 键一致。

## 2. 配置搜索 profile

```bash
cp config/search-profiles.example.yaml config/search-profiles.yaml
cp config/queue-jobs.example.yaml config/queue-jobs.yaml
```

`search-profiles.yaml` 示例：

```yaml
profiles:
  crystal:
    platform: douyin
    mode: keyword
    keyword: "水晶"
    limit: 50
    filters:
      contentType: video
      sortBy: 最多点赞
      publishTime: 一周内
```

## 3. 启动

```bash
cd ../job-queue/node && npm run build

cd ../content-discovery-service
npm install
npm run login -- --platform douyin
npm run worker
```

## 手动触发（调试）

```bash
curl -X POST http://localhost:3100/jobs/douyin_search_crystal/trigger \
  -H "Content-Type: application/json" \
  -d '{}'
```

可选覆盖 `runLabel`（仍从 profile 读关键词）：

```bash
curl -X POST http://localhost:3100/jobs/douyin_search_home_cooking/trigger \
  -H "Content-Type: application/json" \
  -d '{"runLabel":"home_cooking"}'
```

## 失败与重试

由 job-queue 处理：默认最多 3 次重试，仍失败进入 `{queue}:dlq`。搜索返回 0 条结果视为失败并触发重试。
