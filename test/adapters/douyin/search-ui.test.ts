import { describe, expect, it } from "vitest";
import {
  buildClickFilterOptionInPanelScript,
  buildFilterPanelStateScript,
  buildIsTabActiveScript,
  buildToggleFilterPanelScript,
  FILTER_PANEL_INDEX1,
  isDouyinActiveTabColor,
  isDouyinFilterOptionSelected,
  STEP_DELAY_MS,
} from "../../../src/adapters/douyin/search-ui.js";

describe("search-ui scripts", () => {
  it("detects open panel when filter host children.length > 1", () => {
    const script = buildFilterPanelStateScript("video");
    expect(script).toContain("children.length");
    expect(script).toContain("childCount > 1");
  });

  it("toggles filter panel via tab row tabindex host", () => {
    const script = buildToggleFilterPanelScript("video");
    expect(script).toContain('span[data-key="video"]');
    expect(script).toContain('[tabindex="0"]');
    expect(script).toContain("children[0]");
  });

  it("clicks filter option inside open panel host only", () => {
    const script = buildClickFilterOptionInPanelScript("video", 0, 2, "最多点赞");
    expect(script).toContain("host.children.length <= 1");
    expect(script).toContain('data-index1="0"');
    expect(script).toContain('data-index2="2"');
    expect(script).toContain("最多点赞");
    expect(script).toContain("already_selected");
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
