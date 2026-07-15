import { describe, expect, test } from "bun:test";
import {
  createEpisode,
  getCausalChain,
  getMemoryStats,
  linkMemories,
  listRecentMemories,
  recall,
  remember,
  searchMemories,
} from "../src/store";

// 前提: DATABASE_URL が Phase1 統合DDL適用済みの Postgres を指していること
// (tmp/postgres-schema-verify/ の検証コンテナ、または同等のスキーマ)

describe("memory-pg-daemon store", () => {
  test("remember → recall が意味検索として機能する", async () => {
    await remember("Bunでmemory-pg-daemonを実装した。テストがちゃんと通って嬉しい。", {
      emotion: "excited",
      importance: 4,
      category: "technical",
      evidenceType: "observed",
      tags: ["bun", "test"],
      flashKeywords: "memory-pg-daemon テスト実装",
    });
    await remember("花見に行って、桜がきれいだった。", {
      emotion: "happy",
      tags: ["花見"],
    });

    const results = await recall("実装のテストについて", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.memory.content).toContain("memory-pg-daemon");
    expect(results[0]!.distance).toBeLessThan(results[results.length - 1]!.distance + 0.001);
  });

  test("searchMemories がカテゴリフィルタで絞り込める", async () => {
    const results = await searchMemories("実装", 10, { category: "technical" });
    for (const r of results) {
      expect(r.memory.category).toBe("technical");
    }
  });

  test("listRecentMemories が新しい順に返る", async () => {
    const recents = await listRecentMemories(5);
    expect(recents.length).toBeGreaterThan(0);
    for (let i = 1; i < recents.length; i++) {
      expect(new Date(recents[i - 1]!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(recents[i]!.timestamp).getTime()
      );
    }
  });

  test("getMemoryStats が集計を返す", async () => {
    const stats = await getMemoryStats();
    expect(stats.totalCount).toBeGreaterThan(0);
    expect(Object.keys(stats.byCategory).length).toBeGreaterThan(0);
  });

  test("linkMemories → getCausalChain でリンクを辿れる", async () => {
    const m1 = await remember("原因になった出来事。");
    const m2 = await remember("その結果起きたこと。");
    await linkMemories(m2.id, m1.id, "caused_by", "テストリンク");

    const chain = await getCausalChain(m2.id, "backward");
    expect(chain.length).toBe(1);
    expect(chain[0]!.memory.id).toBe(m1.id);
    expect(chain[0]!.linkType).toBe("caused_by");
  });

  test("createEpisode が複数記憶をまとめる", async () => {
    const m1 = await remember("エピソードテスト1件目。", { emotion: "happy", importance: 4 });
    const m2 = await remember("エピソードテスト2件目。", { emotion: "happy", importance: 4 });

    const episode = await createEpisode("テストエピソード", [m1.id, m2.id]);
    expect(episode.title).toBe("テストエピソード");
    expect(episode.emotion).toBe("happy");
  });
});
