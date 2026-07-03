/**
 * GoEmotions 27感情の固定セット（テッド準拠、neutral は含まない: C(27,2)=351ペア）
 *
 * BASELINE_COORDS は「叩き台」のベースライン距離を作るための valence/arousal 座標。
 * GoEmotions の Jaccard 距離レシピ（train 43,410件 → 351ペア → min-max 正規化）を
 * 本物のデータで再計算するまでの代替。英語 Reddit 由来の相対共起を絶対視せず、
 * ペルソナ本人が distances.json で上書きして補正する前提（external-intake-2026-07 Tier 2）。
 */

export const EMOTIONS = [
  "admiration",
  "amusement",
  "anger",
  "annoyance",
  "approval",
  "caring",
  "confusion",
  "curiosity",
  "desire",
  "disappointment",
  "disapproval",
  "disgust",
  "embarrassment",
  "excitement",
  "fear",
  "gratitude",
  "grief",
  "joy",
  "love",
  "nervousness",
  "optimism",
  "pride",
  "realization",
  "relief",
  "remorse",
  "sadness",
  "surprise",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export function isEmotion(name: string): name is Emotion {
  return (EMOTIONS as readonly string[]).includes(name);
}

/** GoEmotions 公式のセンチメント分類 */
export const VALENCE_CLASS: Record<Emotion, "positive" | "negative" | "ambiguous"> = {
  admiration: "positive",
  amusement: "positive",
  approval: "positive",
  caring: "positive",
  desire: "positive",
  excitement: "positive",
  gratitude: "positive",
  joy: "positive",
  love: "positive",
  optimism: "positive",
  pride: "positive",
  relief: "positive",
  anger: "negative",
  annoyance: "negative",
  disappointment: "negative",
  disapproval: "negative",
  disgust: "negative",
  embarrassment: "negative",
  fear: "negative",
  grief: "negative",
  nervousness: "negative",
  remorse: "negative",
  sadness: "negative",
  confusion: "ambiguous",
  curiosity: "ambiguous",
  realization: "ambiguous",
  surprise: "ambiguous",
};

/** [valence, arousal] ともに [-1, 1]。ベースライン距離行列の生成元 */
export const BASELINE_COORDS: Record<Emotion, [number, number]> = {
  admiration: [0.6, 0.35],
  amusement: [0.7, 0.5],
  anger: [-0.8, 0.8],
  annoyance: [-0.5, 0.45],
  approval: [0.5, 0.2],
  caring: [0.6, 0.25],
  confusion: [-0.2, 0.35],
  curiosity: [0.35, 0.5],
  desire: [0.5, 0.6],
  disappointment: [-0.55, 0.25],
  disapproval: [-0.5, 0.35],
  disgust: [-0.7, 0.5],
  embarrassment: [-0.4, 0.5],
  excitement: [0.75, 0.8],
  fear: [-0.75, 0.85],
  gratitude: [0.7, 0.3],
  grief: [-0.85, 0.4],
  joy: [0.85, 0.6],
  love: [0.8, 0.45],
  nervousness: [-0.55, 0.7],
  optimism: [0.6, 0.4],
  pride: [0.65, 0.5],
  realization: [0.2, 0.3],
  relief: [0.55, 0.15],
  remorse: [-0.6, 0.3],
  sadness: [-0.75, 0.3],
  surprise: [0.1, 0.75],
};
