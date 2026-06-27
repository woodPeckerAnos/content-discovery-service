# 消息队列集成（job-queue / Redis Streams）

本服务在 **PC 宿主机** 运行 Worker，从 Docker 内的 Redis 拉取任务；调度由 [`job-scheduler`](../../job-scheduler/) 负责。

## 架构

```text
Docker                          PC 宿主机
┌──────────────────┐           ┌─────────────────────────────┐
│ job-scheduler    │──XADD──►  │                             │
│ (Cron / API)     │           │  npm run worker             │
│                  │  Redis    │  content-discovery-service  │
│ Redis :6379      │◄─XREAD─── │  + 浏览器 profiles/         │
└──────────────────┘           └──────────────┬──────────────┘
                                              │
                                              ▼
                                   PostgreSQL :5432（可选）
```

协议详见 [`job-queue/PROTOCOL.md`](../../job-queue/PROTOCOL.md)。

## 环境变量

与 [`job-queue`](../../job-queue/README.md#environment-variables) 一致：

| 变量 | 默认 | 说明 |
|------|------|------|
| `REDIS_HOST` | `127.0.0.1` | Docker 映射到宿主机的 Redis |
| `REDIS_PORT` | `6379` | |
| `REDIS_PASSWORD` | — | 若 Redis 有密码 |
| `QUEUE_NAME` | `jobs` | 与 job-scheduler 相同 |
| `WORKER_CONCURRENCY` | `1` | **建议 1**（共用浏览器 Profile） |
| `WORKER_NAME` | `content-discovery` | Redis consumer 名称前缀 |
| `QUEUE_JOB_NAMES` | — | 逗号分隔 job 名，覆盖 yaml |
| `QUEUE_JOBS_CONFIG_PATH` | `config/queue-jobs.yaml` | Worker 注册的 job 名列表 |

另需本服务原有变量：`LLM_API_KEY`、`DATABASE_URL`（可选）、浏览器相关配置等。

## 1. 在 job-scheduler 定义任务

编辑 [`job-scheduler/jobs.yaml`](../../job-scheduler/jobs.yaml)：

```yaml
jobs:
  - name: douyin_search_crystal
    description: 抖音关键词搜索 — 水晶
    cron: "0 9 * * *"
    payload:
      platform: douyin
      mode: keyword
      keyword: "水晶"
      limit: 50
      filters:
        contentType: video
        sortBy: 最多点赞
        publishTime: 一周内
```

`name` 必须使用 **snake_case**，且与 Worker 注册的名称一致。

## 2. 在 Worker 注册同名 job

```bash
cp config/queue-jobs.example.yaml config/queue-jobs.yaml
# 编辑 job_names，与 jobs.yaml 的 name 对齐
```

## 3. 启动

```bash
# 确保 job-queue SDK 已构建
cd ../job-queue/node && npm run build

cd ../content-discovery-service
cp config/queue-jobs.example.yaml config/queue-jobs.yaml
npm install
npm run login -- --platform douyin   # 首次
npm run worker
```

## Payload 格式

### 单次搜索

`payload` 直接对应 `SearchRequest`：

```json
{
  "platform": "douyin",
  "mode": "keyword",
  "keyword": "水晶",
  "limit": 50,
  "filters": {
    "contentType": "video",
    "sortBy": "最多点赞",
    "publishTime": "一周内"
  }
}
```

### 批量（同一 job 内多关键词）

```json
{
  "searches": [
    { "platform": "douyin", "mode": "keyword", "keyword": "水晶", "limit": 50 },
    { "platform": "douyin", "mode": "keyword", "keyword": "家常菜", "limit": 50 }
  ]
}
```

## 手动触发（调试）

```bash
curl -X POST http://localhost:3100/jobs/douyin_search_crystal/trigger \
  -H "Content-Type: application/json" \
  -d '{}'
```

自定义 payload：

```bash
curl -X POST http://localhost:3100/jobs/douyin_search_crystal/trigger \
  -H "Content-Type: application/json" \
  -d '{"keyword":"测试","limit":5}'
```

## 失败与重试

由 job-queue 处理：默认最多 3 次重试，仍失败进入 `jobs:dlq`。搜索返回 0 条结果视为失败并触发重试。
