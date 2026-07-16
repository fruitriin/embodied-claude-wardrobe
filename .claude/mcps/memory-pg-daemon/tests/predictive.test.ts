import { describe, expect, test } from "bun:test";
import {
  calculateContextRelevance,
  calculateEmotionBoost,
  calculateNoveltyScore,
  calculatePredictionError,
  memoryTokens,
  queryAmbiguityScore,
  tokenize,
} from "../src/predictive";

const mem = (content: string, category = "daily", tags: string[] = []) => ({ content, category, tags });

describe("tokenize / memoryTokens", () => {
  test("記号区切りでトークン化し小文字化する(旧Python版のre.compile(r\"\\w+\")と同じく文字種の境界では区切らない)", () => {
    expect(tokenize("Bun memory-pg-daemon 実装")).toEqual(
      new Set(["bun", "memory", "pg", "daemon", "実装"])
    );
  });

  test("memoryTokensはcontent/category/tagsを統合する", () => {
    // 区切り文字が無い日本語文は1トークンにまとまる(旧Python版と同じ挙動)
    const tokens = memoryTokens(mem("桜を見た", "observation", ["花見"]));
    expect(tokens.has("桜を見た")).toBe(true);
    expect(tokens.has("observation")).toBe(true);
    expect(tokens.has("花見")).toBe(true);
  });
});

describe("calculateContextRelevance", () => {
  test("contentが完全一致すればcategoryが違っても高いスコアになる", () => {
    const score = calculateContextRelevance("桜を見た", mem("桜を見た"));
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  test("無関係な語彙は0に近い", () => {
    const score = calculateContextRelevance("量子コンピュータの実装", mem("桜を見た"));
    expect(score).toBe(0);
  });

  test("空文字のcontextは0を返す", () => {
    expect(calculateContextRelevance("", mem("何か"))).toBe(0);
  });
});

describe("calculatePredictionError", () => {
  test("relevanceの補数になる", () => {
    const relevance = calculateContextRelevance("桜を見た", mem("桜を見た"));
    const error = calculatePredictionError("桜を見た", mem("桜を見た"));
    expect(error).toBeCloseTo(1 - relevance, 10);
  });
});

describe("calculateNoveltyScore", () => {
  test("activation_countが多いほど新奇性は下がる", () => {
    const freshNovelty = calculateNoveltyScore({ activationCount: 0 }, 0.5);
    const staleNovelty = calculateNoveltyScore({ activationCount: 20 }, 0.5);
    expect(freshNovelty).toBeGreaterThan(staleNovelty);
  });

  test("結果は[0,1]にクランプされる", () => {
    const score = calculateNoveltyScore({ activationCount: 0 }, 5);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("queryAmbiguityScore", () => {
  test("空文字は最大曖昧度1を返す", () => {
    expect(queryAmbiguityScore("")).toBe(1);
  });

  test("短いクエリは曖昧度が高い(語数はスペース区切りで数える、旧Python版と同じ\\w+ベースのトークナイズ)", () => {
    const short = queryAmbiguityScore("記憶");
    const long = queryAmbiguityScore("記憶 検索 保存 想起 整理 連想 索引");
    expect(short).toBeGreaterThan(long);
  });
});

describe("calculateEmotionBoost", () => {
  test("既知の感情はマップ通りのブーストを返す", () => {
    expect(calculateEmotionBoost("excited")).toBe(0.4);
    expect(calculateEmotionBoost("neutral")).toBe(0.0);
  });

  test("未知の感情は0を返す", () => {
    expect(calculateEmotionBoost("unknown_emotion")).toBe(0.0);
  });
});
