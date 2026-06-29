# DOM Plan 动态生成方案（暂存）

> 当前功能已满足需求，本文档供后续迭代参考。  
> 目标：页面加载完成后发现 DOM 结构 → 根据稳定特性生成可缓存的浏览器脚本 → 校验失败再重生。

---

## 目标与边界

| 项 | 内容 |
|----|------|
| **要解决** | 抖音改版后少改 `search-ui.ts` / `dom-extractor.ts`；筛选 toggle 与列表提取统一为「状态机 + 生成脚本」 |
| **V1 范围** | 仅 `douyin` 关键词搜索：① 筛选交互 ② 结果列表提取 |
| **V1 不动** | 网络监听、`network-parser`、rank 合并逻辑、`SearchExecutor` 串行 |
| **明确不做** | 全页 HTML 生成 TS 适配器；OCR 坐标循环；用生成代码替代网络元数据 |

---

## 总体架构

```text
goto + waitReady
    ↓
DomPlanRunner
    ├─ cache hit  → 加载 DomPlan + scripts
    └─ cache miss → discover → rule-planner → (fail) llm-planner → validate → 写缓存
    ↓
evaluateScript(applyFilters)  →  validate
    ↓
scroll + evaluateScript(extractVideos)  →  domOrder
    ↓
network enrich + normalize（现有逻辑）
```

**原则**

- Node 层只做 async 编排
- 浏览器脚本只做：读状态 → 单次 `clickOnce` → 返回结果
- 语义（最多点赞、一周内）来自 `config/platforms/douyin.yaml`，选择器来自 Plan

---

## 「不可改特性」优先级（发现层）

| 优先级 | 特性 | 示例（抖音 PC 搜索） | 用途 |
|--------|------|----------------------|------|
| P0 | `data-*` 稳定属性 | `data-key="video"`、`data-e2e="scroll-list"`、`data-index1/2` | Tab、筛选项、结果列表 |
| P1 | 语义文案 + 结构位置 | 工具栏「筛选」、`排序依据` 分组标题 | 补全 P0 缺失 |
| P2 | 链接模式 | `/video/\d+`、`waterfall_item_{id}` | 结果 ID 提取 |
| P3 | 可见性 / 容器边界 | `#search-result-container`、`:scope > li` | 排除推荐区、隐藏瀑布流 |
| P4 | 选中态启发式 | Tab 红色、option 多 class | **仅校验**，不作为主选择器 |
| 不用 | 随机 class | `EQzCPE5p` 等 | 仅 fingerprint 辅助，不写进长期 Plan |

---

## 核心数据结构（草案）

### PageSnapshot（发现输出）

```typescript
interface PageSnapshot {
  platform: "douyin";
  url: string;
  capturedAt: string;
  toolbar: {
    tabs: Array<{ key: string; text: string; active: boolean; selector: string }>;
    filter: {
      hostSelector: string;
      toggleSelector: string;
      openSignal: "childCount>1";
      groups: Array<{
        title: string;
        options: Array<{
          label: string;
          index1?: number;
          index2?: number;
          selector: string;
          selected: boolean;
        }>;
      }>;
    } | null;
  };
  results: {
    mode: "scroll-list" | "waterfall" | "unknown";
    containerSelector: string;
    itemSelector: string;
    linkPattern: "href-video" | "waterfall-id";
    visibleOnly: true;
  };
}
```

### DomPlan（可缓存执行计划）

```typescript
interface DomPlan {
  version: 1;
  platform: "douyin";
  fingerprint: string;
  createdAt: string;
  source: "rule" | "llm";
  filters: {
    tabKey: string;
    openPanel: { ifClosedClick: string };
    options: Array<{ label: string; selector: string }>;
  };
  extract: { scriptId: string };
  validate: {
    afterTab: string;
    afterPanel: string;
    afterEachOption: string;
    minVideoCount: number;
  };
}
```

### 浏览器脚本契约

| 脚本 | 输出 |
|------|------|
| `applyFilters` | `{ tabActive, panel, sort, publish }` |
| `extractVideos` | `{ items: [{ platformId, title? }] }` 按 DOM 顺序 |
| `readPanelState` | `{ open, childCount }` |

生成模板必须内置 **`clickOnce`**（互斥单次点击），toggle 控件：**关着才点，开着不点**。

---

## 分阶段交付

| 阶段 | 名称 | 交付物 | 接入点 |
|------|------|--------|--------|
| P0 | 契约与目录 | `src/adapters/douyin/dom-plan/types.ts` | 无行为变更 |
| P1 | 结构发现 | `discover-snapshot.ts` + `DISCOVER_SNAPSHOT_SCRIPT` | `goto` 后 |
| P2 | 规则规划器 | `rule-planner.ts` | P0 齐全时不调 LLM |
| P3 | 脚本生成器 | `script-codegen.ts` | 替代硬编码 evaluate 字符串 |
| P4 | 校验与缓存 | `plan-cache.ts`、`plan-validator.ts` | `.cache/dom-plans/douyin/` |
| P5 | 接入筛选 | `DomPlanFilterRunner` | 替换/包装 `applyDouyinSearchFilters` |
| P6 | 接入采集 | `DomPlanExtractRunner` | 替换/包装 `extractVideosFromDom` |
| P7 | LLM 兜底 | `llm-planner.ts` | 规则失败时，裁剪 HTML ≤8KB |
| P8 | Fallback 链 | 保留 `search-ui.ts`、`dom-extractor.ts` | Plan 失败时降级 |
| P9 | 可观测 | 日志 fingerprint / plan_source / validate | Loki 可排查 |

---

## 校验门禁（通过才写缓存）

| 步骤 | 校验 | 失败处理 |
|------|------|----------|
| Plan 静态检查 | 选择器非空、含 `clickOnce`、无 `eval`/`fetch` | 拒绝缓存 |
| 筛选后 | `tabActive === true` | invalidate + fallback |
| 筛选后 | `panel.open === true` | 同上 |
| 选项后 | sort / publish 已选中 | 同上 |
| 采集后 | `items.length >= 1` 且 ID 合法 | 作废 extract 脚本缓存 |

---

## 缓存策略

| 项 | 规则 |
|----|------|
| **Key** | `sha256(normalize(toolbar骨架) + results容器特征 + data-e2e 集合)` |
| **不含** | 搜索关键词、视频标题、结果条数 |
| **失效** | 校验失败、手动清理、Plan `version` 升级 |
| **TTL** | V1 不设 TTL，靠 fingerprint + 校验失效 |

清理命令（后续实现后）：

```bash
rm -rf .cache/dom-plans/douyin .cache/dom-scripts/douyin
```

---

## 待决决策（审查时拍板）

| # | 问题 | 建议 | 备选 |
|---|------|------|------|
| 1 | LLM 何时介入 | 仅规则失败时 | 每次都 LLM |
| 2 | 筛选失败是否中止搜索 | 是（422 + 明确 error） | 继续采未筛选结果 |
| 3 | fingerprint 粒度 | 仅 toolbar + results 容器 | 整页 hash |
| 4 | V1 是否删除 `search-ui.ts` | 保留作 fallback | 一次性删除 |
| 5 | 脚本沙箱 | 白名单 API + 语法检查 | 信任 LLM 输出 |
| 6 | 测试 | fixture HTML + Chromium 集成测 | 只测字符串 |

---

## 可选：V1 最小切片

若砍 scope，可 **仅动态化结果列表提取**，筛选继续用当前 `search-ui.ts`：

| 保留静态 | 先动态化 |
|----------|----------|
| `search-ui.ts` | `dom-extractor` → Plan 生成 `extractVideos` |
| 网络 enrich | scroll-list / waterfall 自动识别 |

---

## Todo List

### 阶段 A：基础设施（不改线上行为）

- [ ] **A1** 定义 `PageSnapshot` / `DomPlan` / `ScriptBundle` 类型（`dom-plan/types.ts`）
- [ ] **A2** 定义 `waitForSearchPageReady` 脚本与 Node 封装
- [ ] **A3** 实现 `DISCOVER_SNAPSHOT_SCRIPT`（P0→P3 规则扫描）
- [ ] **A4** 用 `pc抖音搜索页` + `test/fixtures/douyin-search-scroll-list.html` 写 snapshot 单测
- [ ] **A5** 实现 `computeFingerprint(snapshot)` 并文档化 normalize 规则

### 阶段 B：规则规划 + 代码生成（不接 adapter）

- [ ] **B1** 实现 `rulePlanner(snapshot, filterSemantics)` → `DomPlan | null`
- [ ] **B2** 实现 `scriptCodegen(plan)` → `{ applyFilters, extractVideos, readPanelState }`
- [ ] **B3** 模板强制嵌入 `clickOnce` + toggle 状态机
- [ ] **B4** `PlanValidator` 静态扫描（禁双 click、禁 `console.log`、禁网络）
- [ ] **B5** 生成脚本集成测试：fixture 上 apply + extract，断言 ID 顺序

### 阶段 C：缓存与运行器

- [ ] **C1** `PlanCache` 读写（`.cache/dom-plans/douyin/`）
- [ ] **C2** `DomPlanRunner.loadOrCreate(driver, cfg, filters)`
- [ ] **C3** 校验失败 `invalidate(fingerprint)` + 单次重试
- [ ] **C4** 日志：`dom_plan_fingerprint`、`dom_plan_source`、`dom_validate_ok`

### 阶段 D：接入现有链路

- [ ] **D1** `adapter.ts`：筛选走 `DomPlanRunner.applyFilters()`，失败 fallback `applyDouyinSearchFilters`
- [ ] **D2** `adapter.ts`：采集走 `DomPlanRunner.extractVideos()`，失败 fallback `extractVideosFromDom`
- [ ] **D3** 配置项 `FAIL_SEARCH_ON_FILTER_MISS`（建议默认 `true`）
- [ ] **D4** 更新 `config/platforms/douyin.yaml` 注释：语义 vs 选择器

### 阶段 E：LLM 兜底（可后置）

- [ ] **E1** 裁剪 HTML prompt（toolbar + filter + results 各 ≤3KB）
- [ ] **E2** `llmPlanner` 输出 Zod 校验的 JSON Schema
- [ ] **E3** LLM Plan 须过静态 + live 校验才缓存
- [ ] **E4** 记录 token / 耗时

### 阶段 F：文档与运维

- [ ] **F1** README 增加 DOM Plan 缓存说明
- [ ] **F2** 调试手册：dump snapshot/plan、判断 fingerprint 变化
- [ ] **F3** E2E 验收：同 keyword 连跑 5 次，对比页面与 API 前 10 条 ID

---

## 相关文件（现状）

| 文件 | 职责 |
|------|------|
| `src/adapters/douyin/adapter.ts` | 搜索编排入口 |
| `src/adapters/douyin/search-ui.ts` | 筛选 DOM 脚本（已优化 `clickOnce` / toggle 互斥） |
| `src/adapters/douyin/dom-extractor.ts` | 结果列表 DOM 提取 |
| `src/adapters/douyin/network-parser.ts` | 网络响应解析与 enrich |
| `config/platforms/douyin.yaml` | 筛选语义与默认项 |

---

*最后更新：2026-06-29 · 状态：暂存，待后续迭代*
