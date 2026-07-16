import { describe, expect, test } from "bun:test";
import { adaptiveSearchParams } from "../src/association";

describe("adaptiveSearchParams", () => {
  test("曖昧なクエリ(短い)ほどbranch/depthが広がる", () => {
    const ambiguous = adaptiveSearchParams("記憶", 3, 3, 5);
    const clear = adaptiveSearchParams("記憶 検索 保存 想起 整理 連想 索引", 3, 3, 5);
    expect(ambiguous.branches).toBeGreaterThanOrEqual(clear.branches);
    expect(ambiguous.depth).toBeGreaterThanOrEqual(clear.depth);
  });

  test("シードが1件以下だと曖昧度が底上げされ、branch/depthが広がりやすい", () => {
    const fewSeeds = adaptiveSearchParams("記憶 検索 保存 想起", 3, 3, 1);
    const manySeeds = adaptiveSearchParams("記憶 検索 保存 想起", 3, 3, 10);
    expect(fewSeeds.branches).toBeGreaterThanOrEqual(manySeeds.branches);
  });

  test("branchesは[1,8]、depthは[1,5]にクランプされる", () => {
    const extreme = adaptiveSearchParams("記憶", 100, 100, 1);
    expect(extreme.branches).toBeLessThanOrEqual(8);
    expect(extreme.branches).toBeGreaterThanOrEqual(1);
    expect(extreme.depth).toBeLessThanOrEqual(5);
    expect(extreme.depth).toBeGreaterThanOrEqual(1);

    const zero = adaptiveSearchParams("記憶", 0, 0, 5);
    expect(zero.branches).toBeGreaterThanOrEqual(1);
    expect(zero.depth).toBeGreaterThanOrEqual(1);
  });
});
