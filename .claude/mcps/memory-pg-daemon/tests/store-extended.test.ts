import { describe, expect, test } from "bun:test";
import {
  linkMemories,
  recallByCameraPosition,
  recallWithAssociations,
  remember,
  saveVisualMemory,
} from "../src/store";

describe("recallWithAssociations", () => {
  test("mainの結果 + memory_links で繋がった記憶を返す", async () => {
    const m1 = await remember("recall_with_associationsのテスト起点。");
    const m2 = await remember("m1にリンクした記憶。");
    await linkMemories(m1.id, m2.id, "related");

    const results = await recallWithAssociations("recall_with_associationsのテスト", 1, 1);
    const ids = results.map((r) => r.memory.id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
    // linked の distance は 999 でマークされる
    const linked = results.find((r) => r.memory.id === m2.id);
    expect(linked?.distance).toBe(999.0);
  });
});

describe("save_visual_memory / recall_by_camera_position", () => {
  test("カメラ位置の許容誤差内で検索できる", async () => {
    await saveVisualMemory("窓の外を見た", "/tmp/fake.jpg", { panAngle: 30, tiltAngle: -10 });

    const hit = await recallByCameraPosition(35, -12, 15);
    expect(hit.length).toBeGreaterThan(0);

    const miss = await recallByCameraPosition(-90, 90, 5);
    expect(miss.length).toBe(0);
  });
});
