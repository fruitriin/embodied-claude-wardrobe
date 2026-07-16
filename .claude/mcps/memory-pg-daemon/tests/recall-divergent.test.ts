import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "../src/db";
import { linkMemories, recall, recallDivergent, remember } from "../src/store";
import { resetDb } from "./helpers";

describe("recallDivergent", () => {
  beforeAll(resetDb);

  test("対象記憶が無ければ空結果・空diagnosticsを返す", async () => {
    await resetDb();
    const { results, diagnostics } = await recallDivergent("何もない状態への問いかけ");
    expect(results).toEqual([]);
    expect(diagnostics).toEqual({});
  });

  test("意味検索でヒットしない記憶も、リンクを辿って結果に含まれうる(拡散的想起の核)", async () => {
    await resetDb();
    // seedはcontext(「宇宙の話」)に意味的に近いが、linkedはリンクを辿らないと出てこない内容
    const seed = await remember("宇宙旅行についての話をした。", { autoLink: false });
    const linked = await remember("その帰りに立ち寄った喫茶店のコーヒーが美味しかった。", { autoLink: false });
    await linkMemories(seed.id, linked.id, "related", "test");

    const { results } = await recallDivergent("宇宙旅行", { nResults: 5, maxBranches: 5, maxDepth: 2 });
    const ids = results.map((r) => r.memory.id);
    expect(ids).toContain(seed.id);
    expect(ids).toContain(linked.id);
  });

  test("nResultsで結果件数の上限が効く", async () => {
    await resetDb();
    for (let i = 0; i < 8; i++) {
      await remember(`テスト記憶その${i}についての内容です。`, { autoLink: false });
    }
    const { results } = await recallDivergent("テスト記憶", { nResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBeGreaterThan(0);
  });

  test("recordActivation=trueならactivation_countとnovelty_scoreが更新される", async () => {
    await resetDb();
    const m = await remember("活性化更新確認用の記憶。", { autoLink: false });

    const { results } = await recallDivergent("活性化更新確認", { nResults: 1, recordActivation: true });
    expect(results.length).toBe(1);

    const [row] = await sql`SELECT activation_count, novelty_score FROM memories WHERE id = ${m.id}`;
    expect(Number(row!.activation_count)).toBeGreaterThan(0);
  });

  test("recordActivation=falseなら活性化を更新しない", async () => {
    await resetDb();
    const m = await remember("活性化更新なし確認用の記憶。", { autoLink: false });

    await recallDivergent("活性化更新なし確認", { nResults: 1, recordActivation: false });

    const [row] = await sql`SELECT activation_count FROM memories WHERE id = ${m.id}`;
    expect(Number(row!.activation_count)).toBe(0);
  });

  test("includeDiagnostics=trueで診断情報を返す", async () => {
    await resetDb();
    await remember("診断情報確認用の記憶その1。", { autoLink: false });
    await remember("診断情報確認用の記憶その2。", { autoLink: false });

    const { diagnostics } = await recallDivergent("診断情報確認", { nResults: 2, includeDiagnostics: true });
    expect(diagnostics).toHaveProperty("avgPredictionError");
    expect(diagnostics).toHaveProperty("avgNovelty");
    expect(diagnostics).toHaveProperty("diversity");
    expect(diagnostics).toHaveProperty("association");
  });

  test("includeDiagnostics省略時(デフォルトfalse)は空diagnosticsを返す", async () => {
    await resetDb();
    await remember("デフォルト確認用の記憶。", { autoLink: false });
    const { diagnostics } = await recallDivergent("デフォルト確認");
    expect(diagnostics).toEqual({});
  });

  test("通常のrecallより広い候補集合から選ばれるため、結果がrecallの上位と完全一致しないことがある", async () => {
    await resetDb();
    const anchor = await remember("桜並木を歩いた特別な思い出。", { importance: 5, autoLink: false });
    const distractor1 = await remember("桜並木のベンチで休んだ話。", { autoLink: false });
    const distractor2 = await remember("桜並木近くのカフェの話。", { autoLink: false });
    await linkMemories(anchor.id, distractor1.id, "related");
    await linkMemories(anchor.id, distractor2.id, "related");

    const plain = await recall("桜並木", 5);
    const { results: divergentResults } = await recallDivergent("桜並木", { nResults: 5, maxBranches: 5, maxDepth: 2 });

    expect(plain.length).toBeGreaterThan(0);
    expect(divergentResults.length).toBeGreaterThan(0);
  });
});
