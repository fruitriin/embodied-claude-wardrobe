import type { Memory } from "./types";

// recall_divergent（拡散的想起）の下敷きとなる予測符号化的スコアリング。
// 旧wardrobe SQLite版(.claude/mcps/memory-mcp/src/memory_mcp/predictive.py)の移植。
// DBに依存しない純粋関数のみ(recallDivergent本体のオーケストレーションは別途)。

const TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu;

export function tokenize(text: string): Set<string> {
  const matches = text.match(TOKEN_PATTERN) ?? [];
  return new Set(matches.map((t) => t.toLowerCase()));
}

export function memoryTokens(memory: Pick<Memory, "content" | "category" | "tags">): Set<string> {
  const tokens = tokenize(memory.content);
  for (const t of tokenize(memory.category)) tokens.add(t);
  for (const tag of memory.tags) for (const t of tokenize(tag)) tokens.add(t);
  return tokens;
}

export function contextTokens(context: string): Set<string> {
  return tokenize(context);
}

// 語彙集合のJaccard類似度(overlap/union)を[0,1]で返す
export function calculateContextRelevance(context: string, memory: Pick<Memory, "content" | "category" | "tags">): number {
  const ctx = contextTokens(context);
  if (ctx.size === 0) return 0;

  const mem = memoryTokens(memory);
  if (mem.size === 0) return 0;

  let overlap = 0;
  for (const t of ctx) if (mem.has(t)) overlap++;
  const union = new Set([...ctx, ...mem]).size;
  return union === 0 ? 0 : overlap / union;
}

export function calculatePredictionError(context: string, memory: Pick<Memory, "content" | "category" | "tags">): number {
  return 1 - calculateContextRelevance(context, memory);
}

export function calculateNoveltyScore(memory: Pick<Memory, "activationCount">, predictionError: number): number {
  const activationNovelty = 1 / (1 + Math.max(0, memory.activationCount));
  const novelty = 0.6 * activationNovelty + 0.4 * Math.max(0, Math.min(1, predictionError));
  return Math.max(0, Math.min(1, novelty));
}

// クエリの曖昧さを[0,1]で推定(短い/繰り返しの多いクエリほど曖昧)。
// adaptiveSearchParamsの入力に使う(association.ts)
export function queryAmbiguityScore(context: string): number {
  const tokens = [...contextTokens(context)];
  if (tokens.length === 0) return 1;

  const tokenCount = tokens.length;
  const uniqueRatio = new Set(tokens).size / tokenCount;

  const brevityScore = tokenCount <= 2 ? 1 : Math.max(0, 1 - tokenCount / 10);
  const repetitionScore = 1 - uniqueRatio;

  const ambiguity = 0.6 * brevityScore + 0.4 * repetitionScore;
  return Math.max(0, Math.min(1, ambiguity));
}

// calculateEmotionBoost以下2つはpredictive.pyではなくstore.py(202-243行目)由来。
// DB非依存の純粋関数としてまとまりが良いためここに置いている
const EMOTION_BOOST_MAP: Record<string, number> = {
  excited: 0.4,
  surprised: 0.35,
  moved: 0.3,
  sad: 0.25,
  happy: 0.2,
  nostalgic: 0.15,
  curious: 0.1,
  neutral: 0.0,
};

export function calculateEmotionBoost(emotion: string): number {
  return EMOTION_BOOST_MAP[emotion] ?? 0.0;
}
