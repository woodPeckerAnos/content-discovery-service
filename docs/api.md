# HTTP API

PC 宿主机运行 `npm run server`，默认端口 **3200**。

## 认证

若设置了 `API_TOKEN`，请求需带：

```http
Authorization: Bearer <API_TOKEN>
```

或 `X-API-Token: <API_TOKEN>`。

## 端点

### `GET /health`

服务与执行器状态。

### `POST /v1/search`

同步搜索（等同 CLI `npm run search`），阻塞直到完成。抖音 Tab/筛选通过 Playwright 点击 `data-key` / `data-index` DOM，不用 Stagehand 点筛选面板。

```bash
curl -X POST http://localhost:3200/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "douyin",
    "keyword": "水晶",
    "limit": 50,
    "filters": {
      "contentType": "video",
      "sortBy": "最多点赞",
      "publishTime": "一周内"
    }
  }'
```

### `POST /v1/search/batch`

批量同步搜索。

```json
{
  "searches": [
    { "platform": "douyin", "keyword": "水晶", "limit": 50 },
    { "platform": "douyin", "keyword": "家常菜", "limit": 50 }
  ]
}
```

### `POST /v1/search/async`

异步搜索，立即返回 `202` 与任务 ID；适合 Docker 调度器经 `host.docker.internal` 调用。

```bash
curl -X POST http://localhost:3200/v1/search/async \
  -H "Content-Type: application/json" \
  -d '{"platform":"douyin","keyword":"水晶","limit":5}'
```

### `GET /v1/search/jobs/:id`

查询异步任务状态与结果。

### `GET /v1/search/queue/stats`

当前执行器队列状态（是否 busy、排队数）。

## 与队列 Worker 的关系

- **HTTP Server** 与 **Redis Worker** 共用 `SearchExecutor`，同一进程内不会并发抢浏览器。
- 若分别启动 `npm run server` 与 `npm run worker` 两个进程，仍会各自占用 Profile — **建议只跑一种，或合并为单进程**（后续可扩展）。

推荐部署：

| 场景 | 命令 |
|------|------|
| 被 job-scheduler 队列调度 | `npm run worker` |
| 被 HTTP 直接调用 | `npm run server` |
| 本地调试 | `npm run search` 或 curl API |
