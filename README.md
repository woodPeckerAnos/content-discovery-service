# content-discovery-service

多平台内容发现服务（V1：抖音关键词搜索）。通过 Stagehand + Playwright 混合方案：AI 负责搜索页筛选与滚动，代码负责 Network 解析与链接标准化。

**部署方式**：在 **PC 宿主机** 运行 HTTP 服务或 Redis Worker；调度由 [job-scheduler](../job-scheduler/) 负责。详见 [docs/api.md](./docs/api.md) 与 [docs/mq.md](./docs/mq.md)。

## 功能

- 抖音关键词搜索 + 筛选（内容类型 / 排序 / 发布时间）
- 批量获取前 N 条（默认 50）视频分享链接
- **HTTP API**（同步 / 异步搜索）
- **Redis Streams Worker**（job-queue 消费）
- CLI 本地调试
- LLM 默认 DeepSeek，可通过 `.env` 切换

## 快速开始

### 1. 安装

```bash
cd ~/Projects/content-discovery-service
cp .env.example .env
# LLM_API_KEY、DATABASE_URL、REDIS_* 等
cd ../job-queue/node && npm run build
cd ../content-discovery-service
npm install
```

### 2. 登录抖音

```bash
npm run login -- --platform douyin
```

### 3. 启动 HTTP 服务（推荐）

```bash
npm run server
```

```bash
curl -X POST http://localhost:3200/v1/search \
  -H "Content-Type: application/json" \
  -d '{"platform":"douyin","keyword":"水晶","limit":5}'
```

### 4. 或启动队列 Worker

```bash
npm run worker
```

`config/queue-jobs.yaml` 中的 `job_names` 须与 [job-scheduler/jobs.yaml](../job-scheduler/jobs.yaml) 一致。

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/v1/search` | 同步搜索 |
| POST | `/v1/search/batch` | 批量同步搜索 |
| POST | `/v1/search/async` | 异步搜索（202 + job id） |
| GET | `/v1/search/jobs/:id` | 查询异步任务 |

完整说明见 [docs/api.md](./docs/api.md)。

## 架构

```
job-scheduler ──► Redis ──► npm run worker ──┐
                                              ├── SearchExecutor → Stagehand → DB/JSON
HTTP 客户端 ──► npm run server ──────────────┘
```

`SearchExecutor` 保证同一进程内搜索串行执行，避免争抢浏览器 Profile。

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `SERVER_PORT` | HTTP 端口 | `3200` |
| `API_TOKEN` | 可选 Bearer 认证 | — |
| `LLM_API_KEY` | LLM API Key | （必填） |
| `REDIS_HOST` | Redis（Worker） | `127.0.0.1` |
| `DATABASE_URL` | PostgreSQL（可选） | — |
| `BROWSER_CHANNEL` | 浏览器 | `chrome` |

见 `.env.example`。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run server` | **HTTP 服务** |
| `npm run worker` | Redis 队列 Worker |
| `npm run login` | 登录抖音 |
| `npm run search` | CLI 单次搜索（调试） |
| `npm test` | 单元测试 |

## 测试

```bash
npm test
npm run typecheck
```

## 合规说明

仅供个人/内部分析与选题调研。请遵守各平台服务条款。
