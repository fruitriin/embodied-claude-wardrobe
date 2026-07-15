import { beforeAll, describe, expect, test } from "bun:test";
import { consolidateMemories, getCausalChain, remember } from "../src/store";
import { sql } from "../src/db";
import { resetDb } from "./helpers";

describe("consolidateMemories", () => {
  beforeAll(resetDb);

  test("直近の記憶をリプレイして共活性化・活性化回数・新鮮度・重要度を更新する", async () => {
    const m1 = await remember("consolidate対象1件目。", { importance: 3, autoLink: false });
    const m2 = await remember("consolidate対象2件目。", { importance: 3, autoLink: false });
    const m3 = await remember("consolidate対象3件目。", { importance: 3, autoLink: false });

    const stats = await consolidateMemories(24, 200, 0.5);

    expect(stats.replayEvents).toBeGreaterThan(0);
    expect(stats.coactivationUpdates).toBeGreaterThan(0);
    expect(stats.freshnessDecayed).toBe(true);

    const [row] = await sql`SELECT freshness, activation_count FROM memories WHERE id = ${m1.id}`;
    expect(Number(row!.freshness)).toBeLessThan(1.0);
    expect(Number(row!.activation_count)).toBeGreaterThan(0);

    const [coact] = await sql`
      SELECT weight FROM coactivation WHERE source_id = ${m1.id} AND target_id = ${m2.id}
    `;
    expect(coact).toBeDefined();
    expect(Number(coact!.weight)).toBeGreaterThan(0);

    // linkUpdateStrength=0.5は初回リプレイの閾値0.6には届かないため、まだリンクは無い想定
    const chain = await getCausalChain(m2.id, "any");
    expect(chain.length).toBe(0);
    expect(m3.content).toContain("3件目");
  });

  test("複数回リプレイすると共活性化が閾値を超えrelatedリンクが自動で張られる", async () => {
    await resetDb();
    const m1 = await remember("繰り返しリプレイ対象1。", { autoLink: false });
    const m2 = await remember("繰り返しリプレイ対象2。", { autoLink: false });

    // 1回のconsolidateでは delta=0.5 のためcoactivationは0.5、閾値0.6未満でリンク無し。
    // 2回目で1.0まで積み上がり閾値を超える
    await consolidateMemories(24, 200, 0.5);
    await consolidateMemories(24, 200, 0.5);

    // listRecentMemoriesの並び順(新しい順)次第でリンクの方向(どちらがsource/target)が
    // 決まるため、getCausalChainは両方向を確認する(m1→m2 or m2→m1のどちらでも成立とみなす)
    const [forward, backward] = await Promise.all([
      getCausalChain(m1.id, "any"),
      getCausalChain(m2.id, "any"),
    ]);
    const linked =
      forward.some((c) => c.memory.id === m2.id) || backward.some((c) => c.memory.id === m1.id);
    expect(linked).toBe(true);
  });

  test("importanceが自然に降格する(新鮮度低・アクセス無し・importance>1)", async () => {
    await resetDb();
    const m = await remember("降格対象の記憶。", { importance: 3, autoLink: false });
    // freshnessを直接下げてdrift対象にする(新規remember直後はfreshness=1.0)
    await sql`UPDATE memories SET freshness = 0.01 WHERE id = ${m.id}`;

    const stats = await consolidateMemories(24, 200, 0.2);
    expect(stats.importanceDemoted).toBeGreaterThanOrEqual(1);

    const [row] = await sql`SELECT importance FROM memories WHERE id = ${m.id}`;
    expect(Number(row!.importance)).toBe(2);
  });

  test("importance=5は降格保護される", async () => {
    await resetDb();
    const m = await remember("保護対象の記憶。", { importance: 5, autoLink: false });
    await sql`UPDATE memories SET freshness = 0.01 WHERE id = ${m.id}`;

    await consolidateMemories(24, 200, 0.2);

    const [row] = await sql`SELECT importance FROM memories WHERE id = ${m.id}`;
    expect(Number(row!.importance)).toBe(5);
  });

  test("対象記憶が1件以下でもfreshness減衰とimportance driftは実行される", async () => {
    await resetDb();
    const stats = await consolidateMemories(24, 200, 0.2);
    expect(stats.replayEvents).toBe(0);
    expect(stats.freshnessDecayed).toBe(true);
  });

  test("windowHours=0はサイレントに無効化されず最低1時間として扱われる", async () => {
    // 旧Python版のmax(1, window_hours)を踏襲。クランプ漏れがあるとcutoffが現在時刻
    // 以降になりreplayEventsが常に0になる回帰を防ぐ
    await resetDb();
    const m1 = await remember("windowHours0対象1。", { autoLink: false });
    const m2 = await remember("windowHours0対象2。", { autoLink: false });

    const stats = await consolidateMemories(0, 200, 0.5);
    expect(stats.replayEvents).toBeGreaterThan(0);
    expect(m1.content).toContain("windowHours0");
    expect(m2.content).toContain("windowHours0");
  });

  test("windowHoursの範囲外の記憶はリプレイ対象から除外される", async () => {
    await resetDb();
    const m1 = await remember("ウィンドウ外1。", { autoLink: false });
    const m2 = await remember("ウィンドウ外2。", { autoLink: false });
    // timestampを直接過去に書き換えてwindow外にする
    await sql`UPDATE memories SET timestamp = now() - interval '48 hours' WHERE id IN (${m1.id}, ${m2.id})`;

    const stats = await consolidateMemories(24, 200, 0.5);
    expect(stats.replayEvents).toBe(0);
  });
});
