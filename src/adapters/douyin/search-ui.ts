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

interface TabActiveState {
  active: boolean;
  color: string | null;
}

interface TabClickResult {
  clicked: boolean;
  active: boolean;
  color: string | null;
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

/**
 * 浏览器内单次点击：HTMLElement 用 .click()，否则只 dispatch 一次。
 * toggle 控件禁止 dispatch + click 双触发。
 */
const BROWSER_CLICK_ONCE_HELPER = `
function clickOnce(el) {
  if (!el) return false;
  if (el instanceof HTMLElement) {
    el.click();
    return true;
  }
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return true;
}
`;

const BROWSER_TAB_ACTIVE_HELPER = `
function isTabActive(tab) {
  if (!tab) return false;
  const color = window.getComputedStyle(tab).color;
  const match = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
  if (!match) return false;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  return r >= 150 && r > g + 30 && r > b + 30;
}
`;

const BROWSER_FILTER_HOST_HELPER = `
function getFilterHost(tabKey) {
  const tab = document.querySelector('span[data-key="' + tabKey + '"]');
  if (!tab || !tab.parentElement) return null;
  return tab.parentElement.querySelector('[tabindex="0"]');
}

function readPanelState(tabKey) {
  const host = getFilterHost(tabKey);
  const childCount = host && host.children ? host.children.length : 0;
  return { open: childCount > 1, childCount: childCount };
}
`;

function emptyFilterResult(): DouyinFilterApplyResult {
  return {
    tab: false,
    tabActive: false,
    panel: false,
    panelChildCount: 0,
    sort: false,
    publish: false,
  };
}

function isFilterOptionClickSuccess(reason: string): boolean {
  return reason === "already_selected" || reason === "selected_after_click";
}

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
    ${BROWSER_FILTER_HOST_HELPER}
    return readPanelState("${tabKey}");
  }`;
}

export function buildIsTabActiveScript(tabKey: string): string {
  return `() => {
    ${BROWSER_TAB_ACTIVE_HELPER}
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab) return { active: false, color: null };
    const color = window.getComputedStyle(tab).color;
    return { active: isTabActive(tab), color: color };
  }`;
}

/** 未激活时单次点击 Tab；已激活则不点（避免 toggle 误关） */
export function buildActivateTabScript(tabKey: string): string {
  return `() => {
    ${BROWSER_CLICK_ONCE_HELPER}
    ${BROWSER_TAB_ACTIVE_HELPER}
    const tab = document.querySelector('span[data-key="${tabKey}"]');
    if (!tab) return { clicked: false, active: false, color: null };
    const color = window.getComputedStyle(tab).color;
    if (isTabActive(tab)) {
      return { clicked: false, active: true, color: color };
    }
    const clicked = clickOnce(tab);
    return {
      clicked: clicked,
      active: isTabActive(tab),
      color: window.getComputedStyle(tab).color,
    };
  }`;
}

/** @deprecated 使用 buildActivateTabScript；保留供测试对比 */
export function buildClickTabScript(tabKey: string): string {
  return buildActivateTabScript(tabKey);
}

/** 面板关闭时单次点击「筛选」；已展开则不点 */
export function buildOpenFilterPanelScript(tabKey: string): string {
  return `() => {
    ${BROWSER_CLICK_ONCE_HELPER}
    ${BROWSER_FILTER_HOST_HELPER}
    const state = readPanelState("${tabKey}");
    if (state.open) return { toggled: false, open: true, childCount: state.childCount };

    const host = getFilterHost("${tabKey}");
    const btn = host && host.children && host.children[0];
    if (!btn) return { toggled: false, open: false, childCount: state.childCount };

    const toggled = clickOnce(btn);
    const after = readPanelState("${tabKey}");
    return {
      toggled: toggled,
      open: after.open,
      childCount: after.childCount,
    };
  }`;
}

/** @deprecated 使用 buildOpenFilterPanelScript */
export function buildToggleFilterPanelScript(tabKey: string): string {
  return buildOpenFilterPanelScript(tabKey);
}

export function buildClickFilterOptionInPanelScript(
  tabKey: string,
  index1: number,
  index2: number,
  label: string,
): string {
  const safeLabel = JSON.stringify(label);
  return `() => {
    ${BROWSER_CLICK_ONCE_HELPER}
    function isSelected(el) {
      return el && (el.className || "").trim().split(/\\s+/).length >= 2;
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

    clickOnce(el);
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

async function readPanelState(
  driver: BrowserDriver,
  tabKey: string,
): Promise<FilterPanelState> {
  return driver.evaluateScript<FilterPanelState>(
    buildFilterPanelStateScript(tabKey),
  );
}

async function waitForPanelOpen(
  driver: BrowserDriver,
  tabKey: string,
  timeoutMs: number,
): Promise<FilterPanelState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readPanelState(driver, tabKey);
    if (state.open) {
      return state;
    }
    await driver.wait(STEP_DELAY_MS.panelPoll);
  }
  return readPanelState(driver, tabKey);
}

async function applyFilterOption(
  driver: BrowserDriver,
  tabKey: string,
  index1: number,
  index2: number,
  label: string,
): Promise<boolean> {
  const clickResult = await driver.evaluateScript<FilterOptionClickResult>(
    buildClickFilterOptionInPanelScript(tabKey, index1, index2, label),
  );

  if (isFilterOptionClickSuccess(clickResult.reason)) {
    return true;
  }

  await driver.wait(STEP_DELAY_MS.afterOptionClick);
  const selected = await driver.evaluateScript<boolean>(
    buildIsFilterOptionSelectedScript(tabKey, index1, index2),
  );

  if (!selected) {
    log.info("Douyin filter option click did not show selected state", {
      context: { index1, index2, label, reason: clickResult.reason },
    });
  }

  return selected;
}

/**
 * PC 搜索页筛选：视频 Tab → 筛选面板（children.length>1）→ 排序/发布时间。
 */
export async function applyDouyinSearchFilters(
  driver: BrowserDriver,
  cfg: DouyinPlatformConfig,
  filters?: Record<string, unknown>,
): Promise<DouyinFilterApplyResult> {
  const selection = resolveDouyinFilterDomSelection(cfg, filters);
  const result = emptyFilterResult();

  if (!selection.contentTypeTab && !selection.sort && !selection.publish) {
    return result;
  }

  const tabKey = selection.contentTypeTab ?? "video";

  if (selection.contentTypeTab) {
    let tabResult = await driver.evaluateScript<TabClickResult>(
      buildActivateTabScript(tabKey),
    );
    result.tab = tabResult.clicked;
    await driver.wait(STEP_DELAY_MS.afterTab);

    if (!tabResult.active) {
      const tabState = await driver.evaluateScript<TabActiveState>(
        buildIsTabActiveScript(tabKey),
      );

      if (!tabState.active) {
        log.info("Douyin video tab not active after first click, retrying", {
          context: { tab: tabKey, color: tabState.color },
        });
        tabResult = await driver.evaluateScript<TabClickResult>(
          buildActivateTabScript(tabKey),
        );
        result.tab = result.tab || tabResult.clicked;
        await driver.wait(STEP_DELAY_MS.tabRetry);
      }
    }

    const finalTabState = await driver.evaluateScript<TabActiveState>(
      buildIsTabActiveScript(tabKey),
    );
    result.tabActive = finalTabState.active;

    if (!result.tabActive) {
      log.warn("Douyin content tab not active after click", {
        context: {
          tab: tabKey,
          clicked: result.tab,
          color: finalTabState.color,
        },
      });
    }
  }

  if (!selection.sort && !selection.publish) {
    log.info("Douyin search filters applied", { context: { ...result } });
    return result;
  }

  await driver.wait(STEP_DELAY_MS.beforePanel);

  let panelState = await readPanelState(driver, tabKey);

  if (!panelState.open) {
    await driver.evaluateScript(buildOpenFilterPanelScript(tabKey));
    await driver.wait(STEP_DELAY_MS.afterPanelOpen);
    panelState = await waitForPanelOpen(
      driver,
      tabKey,
      STEP_DELAY_MS.panelOpenTimeout,
    );
  }

  result.panel = panelState.open;
  result.panelChildCount = panelState.childCount;

  if (!result.panel) {
    log.warn("Douyin filter panel not open", {
      context: { tab: tabKey, childCount: panelState.childCount },
    });
    log.info("Douyin search filters applied", { context: { ...result } });
    return result;
  }

  await driver.wait(STEP_DELAY_MS.afterPanelOpen);

  if (selection.sort) {
    result.sort = await applyFilterOption(
      driver,
      tabKey,
      selection.sort.index1,
      selection.sort.index2,
      selection.sort.label,
    );

    if (!result.sort) {
      log.warn("Douyin sort filter click missed", {
        context: {
          sort: selection.sort,
          panelChildCount: result.panelChildCount,
        },
      });
    }

    await driver.wait(STEP_DELAY_MS.afterSort);
  }

  if (selection.publish) {
    result.publish = await applyFilterOption(
      driver,
      tabKey,
      selection.publish.index1,
      selection.publish.index2,
      selection.publish.label,
    );

    if (!result.publish) {
      log.warn("Douyin publish filter click missed", {
        context: {
          publish: selection.publish,
          panelChildCount: result.panelChildCount,
        },
      });
    }

    await driver.wait(STEP_DELAY_MS.afterPublish);
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
