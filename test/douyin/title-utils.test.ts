import { describe, expect, it } from "vitest";
import {
  buildDescFromTextExtra,
  extractDescMapFromText,
  isPlaceholderTitle,
  pickBetterTitle,
  resolveDouyinDisplayTitle,
} from "../../src/adapters/douyin/title-utils.js";

describe("resolveDouyinDisplayTitle", () => {
  it("uses desc with hashtags as display title", () => {
    expect(
      resolveDouyinDisplayTitle(
        { desc: "紫水晶功效 #水晶 #能量" },
        "1234567890123",
      ),
    ).toBe("紫水晶功效 #水晶 #能量");
  });

  it("falls back to text_extra hashtags when desc empty", () => {
    expect(
      resolveDouyinDisplayTitle(
        {
          desc: "",
          textExtra: [{ hashtag_name: "白水晶" }, { hashtag_name: "净化" }],
        },
        "1234567890123",
      ),
    ).toBe("#白水晶 #净化");
  });

  it("uses placeholder when no desc", () => {
    expect(resolveDouyinDisplayTitle({}, "1234567890123")).toBe(
      "抖音视频 1234567890123",
    );
  });
});

describe("pickBetterTitle", () => {
  it("prefers real desc over placeholder", () => {
    expect(
      pickBetterTitle(
        "抖音视频 111",
        "天然紫水晶 #水晶",
        "111",
      ),
    ).toBe("天然紫水晶 #水晶");
  });
});

describe("extractDescMapFromText", () => {
  it("pairs aweme_id with desc from raw JSON text", () => {
    const text = `{"aweme_id":"7509512768215780666","desc":"粉水晶招桃花 #水晶 #粉水晶"}`;
    const map = extractDescMapFromText(text);
    expect(map.get("7509512768215780666")).toBe("粉水晶招桃花 #水晶 #粉水晶");
  });
});

describe("isPlaceholderTitle", () => {
  it("detects placeholder patterns", () => {
    expect(isPlaceholderTitle("抖音视频 123", "123")).toBe(true);
    expect(isPlaceholderTitle("真实标题 #tag", "123")).toBe(false);
  });
});

describe("buildDescFromTextExtra", () => {
  it("joins hashtag names with # prefix", () => {
    expect(
      buildDescFromTextExtra([{ hashtag_name: "水晶" }, { hashtag_name: "#能量" }]),
    ).toBe("#水晶 #能量");
  });
});
