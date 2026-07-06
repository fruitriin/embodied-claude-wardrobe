/**
 * 感情距離行列 — ベースライン生成・min-max 正規化・ペルソナ上書き・方向別移動係数
 *
 * min-max 正規化はテッドのレシピで「必須」（生の Jaccard 距離は [0.929, 1.0] に密集し、
 * 正規化しないと伝播カーブが死ぬ）。このモジュールでは距離の出所によらず
 * 正規化を必ず通すパイプラインとして実装する。
 */

import { EMOTIONS, VALENCE_CLASS, BASELINE_COORDS, type Emotion } from "./emotions";
import type { DirectionCoefficients, DistanceOverrides } from "./types";

/** 正規化済み距離行列。matrix[a][b] は [0,1]、対称、対角は 0 */
export type DistanceMatrix = Record<string, Record<string, number>>;

/** 無順序ペアの正準キー（アルファベット順に "a|b"） */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 生距離の対称行列に min-max 正規化をかける（対角は除外して min/max を取る） */
export function minMaxNormalize(raw: DistanceMatrix): DistanceMatrix {
  let min = Infinity;
  let max = -Infinity;
  for (const a of EMOTIONS) {
    for (const b of EMOTIONS) {
      if (a === b) continue;
      const d = raw[a]![b]!;
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  const span = max - min;
  const out: DistanceMatrix = {};
  for (const a of EMOTIONS) {
    out[a] = {};
    for (const b of EMOTIONS) {
      if (a === b) {
        out[a]![b] = 0;
      } else {
        out[a]![b] = span > 0 ? (raw[a]![b]! - min) / span : 0;
      }
    }
  }
  return out;
}

/** valence/arousal 座標からユークリッド生距離を組む */
export function buildRawBaselineMatrix(): DistanceMatrix {
  const raw: DistanceMatrix = {};
  for (const a of EMOTIONS) {
    raw[a] = {};
    for (const b of EMOTIONS) {
      const [va, aa] = BASELINE_COORDS[a];
      const [vb, ab] = BASELINE_COORDS[b];
      raw[a]![b] = Math.hypot(va - vb, aa - ab);
    }
  }
  return raw;
}

/**
 * ベースライン距離行列（正規化済み）。
 * ペルソナの distances.json（差分上書き、値は正規化済み [0,1]）を
 * 正規化の後に適用する — 「共通ベースライン + ペルソナ別差分上書き」方式。
 */
export function buildDistanceMatrix(overrides?: DistanceOverrides): DistanceMatrix {
  const matrix = minMaxNormalize(buildRawBaselineMatrix());
  if (overrides?.pairs) {
    for (const [key, value] of Object.entries(overrides.pairs)) {
      const [a, b] = key.split("|");
      if (!a || !b || !matrix[a] || !matrix[b] || a === b) continue;
      const v = Math.min(1, Math.max(0, value));
      matrix[a]![b] = v;
      matrix[b]![a] = v; // 静的行列は対称。非対称性は方向別移動係数が担う
    }
  }
  return matrix;
}

/**
 * 方向別移動係数（うちの独自拡張、external-intake-2026-07 Tier 2）。
 * 優先順位: 順序付きペア個別指定 > valence クラス指定 > 1.0
 */
export function directionCoefficient(
  coefs: DirectionCoefficients,
  from: Emotion,
  to: Emotion
): number {
  const pair = coefs.pairs[`${from}->${to}`];
  if (pair !== undefined) return pair;
  const valenceKey = `${VALENCE_CLASS[from]}->${VALENCE_CLASS[to]}`;
  const valence = coefs.valence[valenceKey];
  if (valence !== undefined) return valence;
  return 1.0;
}

/** 実効距離 = 正規化距離 × 方向別係数（方向によって非対称になる） */
export function effectiveDistance(
  matrix: DistanceMatrix,
  coefs: DirectionCoefficients,
  from: Emotion,
  to: Emotion
): number {
  return matrix[from]![to]! * directionCoefficient(coefs, from, to);
}

/**
 * 伝播カーブ初期値（テッド準拠）: activation = strength * exp(-4 * distance²)
 * 距離 0.5 で約 37%。
 */
export function activationCurve(strength: number, distance: number): number {
  return strength * Math.exp(-4 * distance * distance);
}
