import { describe, expect, it } from "vitest";
import { searchExecutor } from "../../src/services/search-executor.js";

describe("searchExecutor", () => {
  it("runs tasks sequentially", async () => {
    const order: number[] = [];

    const first = searchExecutor.enqueue(async () => {
      await sleep(30);
      order.push(1);
      return "a";
    });

    const second = searchExecutor.enqueue(async () => {
      order.push(2);
      return "b";
    });

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(order).toEqual([1, 2]);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
