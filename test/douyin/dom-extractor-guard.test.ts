import { describe, expect, it } from "vitest";
import { EXTRACT_VIDEOS_SCRIPT } from "../../src/adapters/douyin/dom-extractor.js";

/**
 * 回归：tsx 编译后的 page.evaluate(fn) 会在浏览器注入 __name，导致 ReferenceError。
 * DOM 提取脚本必须保持纯字符串，并在集成测试中于真实 Chromium 执行。
 */
describe("EXTRACT_VIDEOS_SCRIPT guard", () => {
  it("does not contain tsx/node injection helpers", () => {
    expect(EXTRACT_VIDEOS_SCRIPT).not.toMatch(/__name/);
    expect(EXTRACT_VIDEOS_SCRIPT).not.toMatch(/__defProp/);
    expect(EXTRACT_VIDEOS_SCRIPT).not.toMatch(/__export/);
  });

  it("is a callable browser expression", () => {
    expect(EXTRACT_VIDEOS_SCRIPT.trim().startsWith("() =>")).toBe(true);
    expect(EXTRACT_VIDEOS_SCRIPT).toContain("document.querySelectorAll");
  });

  it("parses as valid JS function body in Node (syntax only)", () => {
    expect(() => {
      // eslint-disable-next-line no-new-func
      new Function(`return (${EXTRACT_VIDEOS_SCRIPT})`)();
    }).not.toThrow();
  });
});
