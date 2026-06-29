import type { BrowserDriver } from "../../drivers/browser-driver.js";
import type { DouyinPlatformConfig } from "./filter-map.js";
import { resolveDouyinFilterDomSelection } from "./filter-map.js";
import { log } from "../../utils/logger.js";

export interface DouyinFilterApplyResult {
  tab: boolean;
  tabActive: boolean;
  panel: boolean;
  panelChildCount: number;
  sort: boolean;
  publish: boolean;
}

interface FilterPanelState {
  open: boolean;
  childCount: number;
}

interface FilterOptionClickResult {
  clicked: boolean;
  reason: string;
}

/** 各步点击后等待，避免 Tab/面板尚未就绪导致后续点击失效 */
export const STEP_DELAY_MS = {
  afterTab: 2500,
  beforePanel: 1500,
  panelPoll: 300,
  panelOpenTimeout: 6000,
  afterPanelOpen: 800,
  afterSort: 1500,
  afterPublish: 1500,
  tabRetry: 1500,
  afterOptionClick: 500,
} as const;

/** 筛选面板 index1 分组：0=排序依据 1=发布时间 2=视频时长 3=搜索范围 */
export const FILTER_PANEL_INDEX1 = {
  sortBy: 0,
  publishTime: 1,
  videoDuration: 2,
  searchScope: 3,
} as const;

/** 抖音 PC 搜索 Tab 选中态：文案呈红色（不依赖随机 className） */
export function isDouyinActiveTabColor(color: string): boolean {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return false;
  }

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);

  return r >= 150 && r > g + 30 && r > b + 30;
}

/** 筛选项是否处于选中态：除基础 class 外还有额外 class（如 sDNqBVWH） */
export function isDouyinFilterOptionSelected(className: string): boolean {
  return className.trim().split(/\s+/).length >= 2;
}

export function buildFilterPanelStateScript(tabKey: string): string {
  return `() => {
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab || !tab.parentElement) return { open: false, childCount: 0 };
    const host = tab.parentElement.querySelector('[tabindex="0"]');
    const childCount = host && host.children ? host.children.length : 0;
    return { open: childCount > 1, childCount: childCount };
  }`;
}

/** Tab 是否已激活：getComputedStyle(tab).color 是否为选中红色 */
export function buildIsTabActiveScript(tabKey: string): string {
  return `() => {
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab) return { active: false, color: null };
    const color = window.getComputedStyle(tab).color;
    const match = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!match) return { active: false, color: color };
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    const active = r >= 150 && r > g + 30 && r > b + 30;
    return { active: active, color: color };
  }`;
}

function buildClickTabScript(tabKey: string): string {
  return `() => {
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab) return false;
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    if (tab instanceof HTMLElement) tab.click();
    return true;
  }`;
}

/** 点击筛选按钮（host.children[0]） */
export function buildToggleFilterPanelScript(tabKey: string): string {
  return `() => {
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab || !tab.parentElement) return false;
    const host = tab.parentElement.querySelector('[tabindex="0"]');
    const btn = host && host.children && host.children[0];
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    if (btn instanceof HTMLElement) btn.click();
    return true;
  }`;
}

/** 在已展开的筛选面板 host 内点击 data-index 选项（可选文案 fallback） */
export function buildClickFilterOptionInPanelScript(
  tabKey: string,
  index1: number,
  index2: number,
  label: string,
): string {
  const safeLabel = JSON.stringify(label);
  return `() => {
    function isSelected(el) {
      return el && (el.className || "").trim().split(/\\s+/).length >= 2;
    }
    function dispatchClick(el) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (el instanceof HTMLElement) el.click();
    }

    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab || !tab.parentElement) return { clicked: false, reason: "no_host" };
    const host = tab.parentElement.querySelector('[tabindex="0"]');
    if (!host || host.children.length <= 1) {
      return { clicked: false, reason: "panel_closed", childCount: host ? host.children.length : 0 };
    }

    let el = host.querySelector('span[data-index1="${index1}"][data-index2="${index2}"]');
    if (!el) {
      const label = ${safeLabel};
      const candidates = host.querySelectorAll('span[data-index1="${index1}"]');
      for (let i = 0; i < candidates.length; i++) {
        const text = (candidates[i].textContent || "").trim();
        if (text === label) {
          el = candidates[i];
          break;
        }
      }
    }
    if (!el) return { clicked: false, reason: "option_not_found" };
    if (isSelected(el)) return { clicked: true, reason: "already_selected" };

    dispatchClick(el);
    return {
      clicked: isSelected(el),
      reason: isSelected(el) ? "selected_after_click" : "click_no_selected_state",
    };
  }`;
}

export function buildIsFilterOptionSelectedScript(
  tabKey: string,
  index1: number,
  index2: number,
): string {
  return `() => {
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    const host = tab?.parentElement?.querySelector('[tabindex="0"]');
    if (!host || host.children.length <= 1) return false;
    const el = host.querySelector('span[data-index1="${index1}"][data-index2="${index2}"]');
    if (!el) return false;
    return (el.className || "").trim().split(/\\s+/).length >= 2;
  }`;
}

async function readFilterPanelState(
  driver: BrowserDriver,
  tabKey: string,
): Promise<FilterPanelState> {
  return driver.evaluateScript<FilterPanelState>(
    buildFilterPanelStateScript(tabKey),
  );
}

async function waitForFilterPanelOpen(
  driver: BrowserDriver,
  tabKey: string,
  timeoutMs: number,
): Promise<FilterPanelState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readFilterPanelState(driver, tabKey);
    if (state.open) {
      return state;
    }
    await driver.wait(STEP_DELAY_MS.panelPoll);
  }
  return readFilterPanelState(driver, tabKey);
}

async function ensureFilterPanelOpen(
  driver: BrowserDriver,
  tabKey: string,
): Promise<FilterPanelState> {
  let state = await readFilterPanelState(driver, tabKey);
  if (state.open) {
    return state;
  }

  const toggled = await driver.evaluateScript<boolean>(
    buildToggleFilterPanelScript(tabKey),
  );
  if (!toggled) {
    return { open: false, childCount: 0 };
  }

  await driver.wait(STEP_DELAY_MS.afterPanelOpen);
  state = await waitForFilterPanelOpen(
    driver,
    tabKey,
    STEP_DELAY_MS.panelOpenTimeout,
  );
  if (state.open) {
    return state;
  }

  log.info("Douyin filter panel not open after first toggle, retrying", {
    context: { tab: tabKey, childCount: state.childCount },
  });

  await driver.evaluateScript<boolean>(buildToggleFilterPanelScript(tabKey));
  await driver.wait(STEP_DELAY_MS.afterPanelOpen);
  return waitForFilterPanelOpen(driver, tabKey, STEP_DELAY_MS.panelOpenTimeout);
}

async function clickFilterOptionInPanel(
  driver: BrowserDriver,
  tabKey: string,
  index1: number,
  index2: number,
  label: string,
): Promise<boolean> {
  const clickResult = await driver.evaluateScript<FilterOptionClickResult>(
    buildClickFilterOptionInPanelScript(tabKey, index1, index2, label),
  );

  if (
    clickResult.reason === "already_selected" ||
    clickResult.reason === "selected_after_click"
  ) {
    return true;
  }

  await driver.wait(STEP_DELAY_MS.afterOptionClick);

  const selected = await driver.evaluateScript<boolean>(
    buildIsFilterOptionSelectedScript(tabKey, index1, index2),
  );
  if (selected) {
    return true;
  }

  log.info("Douyin filter option click did not show selected state", {
    context: { index1, index2, label, reason: clickResult.reason },
  });
  return false;
}

async function clickVideoTabWithRetry(
  driver: BrowserDriver,
  tabKey: string,
): Promise<{ clicked: boolean; active: boolean; color: string | null }> {
  let clicked = await driver.evaluateScript<boolean>(buildClickTabScript(tabKey));
  await driver.wait(STEP_DELAY_MS.afterTab);

  let state = await driver.evaluateScript<{ active: boolean; color: string | null }>(
    buildIsTabActiveScript(tabKey),
  );
  if (!state.active && clicked) {
    log.info("Douyin video tab not active after first click, retrying", {
      context: { tab: tabKey, color: state.color },
    });
    clicked = await driver.evaluateScript<boolean>(buildClickTabScript(tabKey));
    await driver.wait(STEP_DELAY_MS.tabRetry);
    state = await driver.evaluateScript<{ active: boolean; color: string | null }>(
      buildIsTabActiveScript(tabKey),
    );
  }

  return { clicked, active: state.active, color: state.color };
}

/**
 * PC 搜索页筛选：视频 Tab → 等就绪 → 筛选面板（children.length>1）→ 排序/发布时间。
 */
export async function applyDouyinSearchFilters(
  driver: BrowserDriver,
  cfg: DouyinPlatformConfig,
  filters?: Record<string, unknown>,
): Promise<DouyinFilterApplyResult> {
  const selection = resolveDouyinFilterDomSelection(cfg, filters);
  const result: DouyinFilterApplyResult = {
    tab: false,
    tabActive: false,
    panel: false,
    panelChildCount: 0,
    sort: false,
    publish: false,
  };

  if (!selection.contentTypeTab && !selection.sort && !selection.publish) {
    return result;
  }

  const tabKey = selection.contentTypeTab ?? "video";

  if (selection.contentTypeTab) {
    const tabResult = await clickVideoTabWithRetry(driver, tabKey);
    result.tab = tabResult.clicked;
    result.tabActive = tabResult.active;

    if (!result.tabActive) {
      log.warn("Douyin content tab not active after click", {
        context: { tab: tabKey, clicked: result.tab, color: tabResult.color },
      });
    }
  }

  if (selection.sort || selection.publish) {
    await driver.wait(STEP_DELAY_MS.beforePanel);

    const panelState = await ensureFilterPanelOpen(driver, tabKey);
    result.panel = panelState.open;
    result.panelChildCount = panelState.childCount;

    if (!result.panel) {
      log.warn("Douyin filter panel not open", {
        context: { tab: tabKey, childCount: panelState.childCount },
      });
      return result;
    }

    await driver.wait(STEP_DELAY_MS.afterPanelOpen);

    if (selection.sort) {
      result.sort = await clickFilterOptionInPanel(
        driver,
        tabKey,
        selection.sort.index1,
        selection.sort.index2,
        selection.sort.label,
      );
      await driver.wait(STEP_DELAY_MS.afterSort);

      if (!result.sort) {
        log.warn("Douyin sort filter click missed", {
          context: {
            sort: selection.sort,
            panelChildCount: result.panelChildCount,
          },
        });
      }
    }

    if (selection.publish) {
      result.publish = await clickFilterOptionInPanel(
        driver,
        tabKey,
        selection.publish.index1,
        selection.publish.index2,
        selection.publish.label,
      );
      await driver.wait(STEP_DELAY_MS.afterPublish);

      if (!result.publish) {
        log.warn("Douyin publish filter click missed", {
          context: {
            publish: selection.publish,
            panelChildCount: result.panelChildCount,
          },
        });
      }
    }
  }

  log.info("Douyin search filters applied", {
    context: {
      tab: result.tab,
      tabActive: result.tabActive,
      panel: result.panel,
      panelChildCount: result.panelChildCount,
      sort: result.sort,
      publish: result.publish,
    },
  });

  return result;
}
