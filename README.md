# content-discovery-service

多平台内容发现服务（V1：抖音关键词搜索）。通过 Stagehand + Playwright 混合方案：AI 负责搜索页筛选与滚动，代码负责 Network 解析与链接标准化。

## 功能

- 抖音关键词搜索 + 筛选（内容类型 / 排序 / 发布时间）
- 批量获取前 N 条（默认 50）视频分享链接
- 统一 `PlatformAdapter` 抽象，预留小红书、X、微博等平台
- CLI 单次/批量执行 + 可选 Cron 调度
- LLM 默认 DeepSeek，可通过 `.env` 切换

## 快速开始

### 1. 安装依赖

```bash
cd ~/Projects/content-discovery-service
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY
npm install
```

### 2. 首次登录抖音（重要）

默认使用 **headed 浏览器** 和持久化 Profile（`profiles/douyin/`）：

```bash
npm run search -- --platform douyin --keyword "测试" --limit 5
```

浏览器弹出后，如未登录请手动登录抖音 Web 端。登录态会保存在 Profile 目录，后续任务无需重复登录。

如遇验证码，在浏览器中完成后重新运行命令即可。

### 3. 单次搜索

```bash
npm run search -- \
  --platform douyin \
  --keyword "家常菜" \
  --content-type video \
  --sort-by 最多点赞 \
  --publish-time 一周内 \
  --limit 50
```

结果写入 `results/YYYY-MM-DD-douyin-家常菜.json`。

### 4. 批量任务

```bash
npm run jobs -- --file config/jobs.example.json
```

## 环境变量


| 变量                    | 说明           | 默认                            |
| --------------------- | ------------ | ----------------------------- |
| `LLM_API_KEY`         | LLM API Key  | （必填）                          |
| `LLM_MODEL`           | 模型名          | `deepseek/deepseek-chat`      |
| `LLM_BASE_URL`        | API Base URL | `https://api.deepseek.com/v1` |
| `HEADLESS`            | 无头模式         | `false`                       |
| `BROWSER_PROFILE_DIR` | 浏览器 Profile  | `profiles/douyin`             |
| `MIN_RESULT_RATIO`    | 最低结果比例       | `0.9`                         |
| `MAX_SCROLLS`         | 最大滚动次数       | `15`                          |
| `CRON_ENABLED`        | 启用 Cron      | `false`                       |
| `CRON_SCHEDULE`       | Cron 表达式     | `0 9,21 * * *`                |
| `JOBS_FILE`           | 批量任务文件       | `config/jobs.example.json`    |


切换其他 OpenAI 兼容模型示例：

```env
LLM_MODEL=openai/gpt-4o
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
```

## 定时调度

```bash
# CRON_ENABLED=false 时：立即执行一次 jobs 后退出
npm run scheduler

# 启用 Cron（在 .env 中设置 CRON_ENABLED=true）
npm run scheduler
```

## 架构

```
CLI / Scheduler
    → SearchService
        → PlatformAdapter (douyin / stubs)
        → StagehandDriver (Playwright + Stagehand)
    → ResultStore (JSON)
```

### 扩展新平台

1. 在 `src/adapters/<platform>/` 实现 `PlatformAdapter`
2. 在 `config/platforms/<platform>.yaml` 添加筛选与 Network 配置
3. 在 `src/adapters/registry.ts` 注册 adapter

参考 stub：`src/adapters/_stubs/xiaohongshu.ts`、`src/adapters/_stubs/x.ts`

## 与 douyin-transcript-service 对接

本服务输出的 JSON 中 `items[].shareUrl` 可直接作为转录服务的批量输入：

```bash
# 从结果 JSON 提取链接（示例）
node -e "const r=require('./results/2026-06-23-douyin-家常菜.json'); console.log(r.items.map(i=>i.shareUrl).join('\n'))"
```

## 测试

```bash
npm test
npm run typecheck
```

## 合规说明

仅供个人/内部分析与选题调研。请遵守各平台服务条款，勿用于未授权的大规模抓取或商业分发。

## 脚本


| 命令                  | 说明            |
| ------------------- | ------------- |
| `npm run search`    | 单次搜索          |
| `npm run jobs`      | 批量任务          |
| `npm run scheduler` | 定时/一次性调度      |
| `npm run typecheck` | TypeScript 检查 |
| `npm test`          | 单元测试          |


