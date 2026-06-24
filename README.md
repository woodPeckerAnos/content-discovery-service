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

登录态保存在项目内 `profiles/douyin/`（Chrome userDataDir）。**只需登录一次**，后续搜索会复用。

```bash
npm run login -- --platform douyin
```

浏览器打开后完成扫码/手机号登录，确认右上角出现头像，回到终端按 **Enter** 保存并退出。

> 不要在登录过程中关闭浏览器窗口；也不要同时开两个任务抢同一个 Profile。

若每次都要重新登录，常见原因：
- 旧版本用 Stagehand 直接杀进程退出，Cookie 可能没写入磁盘（**请重新执行一次 `npm run login`**）
- 在任务跑到一半时手动关了浏览器
- 用日常 Chrome 登录，但任务用的是 `profiles/douyin/` 里的独立浏览器（Cookie 不共享）

当前实现由 **Playwright `launchPersistentContext`** 管理 Profile，退出时 `context.close()` 正常落盘，并额外备份 `profiles/douyin/auth-state.json`。建议 `.env` 中设置 `BROWSER_CHANNEL=chrome` 使用本机 Chrome。

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
| `BROWSER_CHANNEL`     | 浏览器渠道         | `chrome`（本机 Chrome）       |
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
# 单元测试（network 解析、脚本静态检查，速度快）
npm test

# 集成测试：在真实 Chromium 里执行 page.evaluate（可发现 __name 类问题）
# 首次会自动下载 Chromium；也可手动：npm run setup:browsers
npm run test:integration

# 全部测试
npm run test:all

# 提交前 smoke（typecheck + unit + integration）
npm run smoke

npm run typecheck
```

**建议**：改 `dom-extractor`、Playwright 相关代码后，至少跑 `npm run test:integration`。  
此前 `page.evaluate(fn)` 在 tsx 下会注入 `__name` 导致浏览器报错，集成测试会在本地复现这类问题，而不必每次真跑抖音搜索。

## 合规说明

仅供个人/内部分析与选题调研。请遵守各平台服务条款，勿用于未授权的大规模抓取或商业分发。

## 脚本


| 命令                  | 说明            |
| ------------------- | ------------- |
| `npm run login`     | 一次性登录并保存 Cookie |
| `npm run search`    | 单次搜索          |
| `npm run jobs`      | 批量任务          |
| `npm run scheduler` | 定时/一次性调度      |
| `npm run typecheck` | TypeScript 检查 |
| `npm test`          | 单元测试          |
| `npm run setup:browsers` | 安装 Playwright Chromium（集成测试依赖） |
| `npm run test:integration` | Chromium 集成测试 |
| `npm run smoke`     | 提交前快速验证（含自动装浏览器 + 全部测试） |


