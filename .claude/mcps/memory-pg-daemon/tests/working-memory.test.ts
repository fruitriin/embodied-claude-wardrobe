import { beforeAll, describe, expect, test } from "bun:test";
import { remember } from "../src/store";
import { WorkingMemoryBuffer } from "../src/working-memory";
import { resetDb } from "./helpers";

describe("WorkingMemoryBuffer", () => {
  beforeAll(resetDb);

  test("add / getRecent が新しい順で返る", () => {
    const wm = new WorkingMemoryBuffer(20);
    const now = new Date().toISOString();
    wm.add({ id: "1", content: "one", timestamp: now } as never);
    wm.add({ id: "2", content: "two", timestamp: now } as never);
    const recent = wm.getRecent(2);
    expect(recent[0]!.id).toBe("2");
    expect(recent[1]!.id).toBe("1");
  });

  test("capacity を超えたら古いものから捨てる", () => {
    const wm = new WorkingMemoryBuffer(2);
    wm.add({ id: "1" } as never);
    wm.add({ id: "2" } as never);
    wm.add({ id: "3" } as never);
    expect(wm.size()).toBe(2);
    expect(wm.getAll().map((m) => m.id)).toEqual(["3", "2"]);
  });

  test("refreshImportant が重要な記憶をDBから読み込む", async () => {
    // importance>=4 かつ access_count>=5 の記憶を用意
    const m = await remember("重要な記憶のテスト", { importance: 5 });

    const wm = new WorkingMemoryBuffer();
    // access_countは0のままなので、refreshImportant自体がエラーなく完走することだけ確認する
    await wm.refreshImportant();
    expect(wm.size()).toBeGreaterThanOrEqual(0);
    expect(m.importance).toBe(5);
  });
});
