import { describe, expect, it } from "vitest";
import {
  buildActivateTabScript,
  buildClickFilterOptionInPanelScript,
  buildFilterPanelStateScript,
  buildIsTabActiveScript,
  buildOpenFilterPanelScript,
  FILTER_PANEL_INDEX1,
  isDouyinActiveTabColor,
  isDouyinFilterOptionSelected,
  STEP_DELAY_MS,
} from "../../../src/adapters/douyin/search-ui.js";

describe("search-ui scripts", () => {
  it("detects open panel when filter host children.length > 1", () => {
    const script = buildFilterPanelStateScript("video");
    expect(script).toContain("childCount > 1");
  });

  it("opens filter panel only when closed (no blind toggle retry)", () => {
    const script = buildOpenFilterPanelScript("video");
    expect(script).toContain("getFilterHost");
    expect(script).toContain('[tabindex="0"]');
    expect(script).toContain("if (state.open)");
    expect(script).toContain("clickOnce");
    expect(script).not.toContain("console.log");
  });

  it("activates tab with single clickOnce and skips when already active", () => {
    const script = buildActivateTabScript("video");
    expect(script).toContain("clickOnce");
    expect(script).toContain("if (isTabActive(tab))");
    expect(script).not.toMatch(
      /dispatchEvent[\s\S]*clickOnce[\s\S]*\.click\(\)/,
    );
  });

  it("clicks filter option once inside open panel host", () => {
    const script = buildClickFilterOptionInPanelScript("video", 0, 2, "最多点赞");
    expect(script).toContain("host.children.length <= 1");
    expect(script).toContain('data-index1="0"');
    expect(script).toContain('data-index2="2"');
    expect(script).toContain("最多点赞");
    expect(script).toContain("already_selected");
    expect(script).toContain("clickOnce(el)");
    expect(script).not.toContain("function dispatchClick");
  });

  it("detects active tab by computed text color (red)", () => {
    const script = buildIsTabActiveScript("video");
    expect(script).toContain("getComputedStyle");
    expect(script).toContain(".color");

    expect(isDouyinActiveTabColor("rgb(254, 44, 85)")).toBe(true);
    expect(isDouyinActiveTabColor("rgb(78, 89, 105)")).toBe(false);
  });

  it("detects selected filter option by extra class token", () => {
    expect(isDouyinFilterOptionSelected("eXMmo3JR sDNqBVWH")).toBe(true);
    expect(isDouyinFilterOptionSelected("eXMmo3JR")).toBe(false);
  });

  it("documents filter panel index1 groups", () => {
    expect(FILTER_PANEL_INDEX1.sortBy).toBe(0);
    expect(FILTER_PANEL_INDEX1.publishTime).toBe(1);
  });

  it("uses generous step delays between filter clicks", () => {
    expect(STEP_DELAY_MS.afterTab).toBeGreaterThanOrEqual(2000);
    expect(STEP_DELAY_MS.panelOpenTimeout).toBeGreaterThanOrEqual(5000);
    expect(STEP_DELAY_MS.afterSort).toBeGreaterThanOrEqual(1000);
  });
});
