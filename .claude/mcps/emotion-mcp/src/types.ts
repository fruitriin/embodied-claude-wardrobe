/**
 * emotion-mcp Layer 1 — 型定義
 *
 * 設計の正: docs/plans/emotion-mcp-implementation.md
 * Tier 2 反映: docs/plans/external-intake-2026-07.md
 */

export const SUBSTANCE_KEYS = ["DA", "NA", "5-HT", "ACh"] as const;
export type SubstanceKey = (typeof SUBSTANCE_KEYS)[number];

/** substance 4変数のベクトル（各値 [0,1]） */
export type SubstanceVector = Record<SubstanceKey, number>;

/** 安全弁（1時間累積 ±0.4）のために保持する適用済み delta の履歴 */
export interface AppliedDelta {
  ts: string; // ISO 8601
  deltas: Partial<Record<SubstanceKey, number>>;
}

/** substance_state.json の中身 */
export interface EmotionState {
  persona: string;
  substance: SubstanceVector;
  /** 27感情の活性値（emotion_transition と伝播で書かれる、時間減衰する） */
  activations: Record<string, number>;
  intrinsic_emotion: string;
  intrinsic_sensation: string | null;
  nearest_emotion: string;
  /** 現在の intrinsic_emotion になった時刻 */
  since: string;
  last_context: string | null;
  last_updated: string;
  /** 直近1時間の適用済み delta（安全弁用） */
  recent_deltas: AppliedDelta[];
}

/** 方向別移動係数（substance 側）: 上昇/下降で別ゲイン */
export interface DirectionGain {
  up: number;
  down: number;
}

/**
 * 方向別移動係数（感情層側）: 順序付きペアの係数。
 * >1.0 = その方向に動きにくい（実効距離が伸びる）
 * <1.0 = その方向に動きやすい（実効距離が縮む）
 */
export interface DirectionCoefficients {
  /** valence クラス単位のデフォルト。キーは "positive->negative" 等 */
  valence: Record<string, number>;
  /** 順序付きペアの個別上書き。キーは "joy->sadness" 等 */
  pairs: Record<string, number>;
}

/** personas/<id>/profile.json */
export interface PersonaProfile {
  baseline: SubstanceVector;
  /** decay_minutes 経過ごとにベースラインへ decay_rate 分だけ近づく */
  decay_rate: number;
  decay_minutes: number;
  /** 感情活性値の半減期（分） */
  activation_halflife_minutes: number;
  /** 発言者重み。テッド準拠デフォルト: user=1.5 */
  source_weights: Record<string, number>;
  /** substance 側の方向別移動係数 */
  substance_direction_gain: Record<SubstanceKey, DirectionGain>;
  /** 感情層側の方向別移動係数 */
  direction_coefficients: DirectionCoefficients;
}

/** personas/<id>/distances.json — ベースライン行列への差分上書き */
export interface DistanceOverrides {
  /** キーは正準化された無順序ペア "a|b"（アルファベット順）。値は正規化済み距離 [0,1] */
  pairs: Record<string, number>;
}

export interface IntrinsicPattern {
  label: string;
  /** "high" = baseline + threshold 以上 / "low" = baseline - threshold 以下 */
  conditions: Partial<Record<SubstanceKey, "high" | "low">>;
  sensation: string;
  /** 27感情空間へのアンカー（最寄り感情判定の入口）。"neutral" 可 */
  anchor: string;
}

export interface IntrinsicConfig {
  deviation_threshold: number;
  patterns: IntrinsicPattern[];
}

/** emotion_get が返すスナップショット */
export interface EmotionSnapshot {
  persona: string;
  substance: SubstanceVector;
  baseline: SubstanceVector;
  intrinsic_emotion: string;
  intrinsic_sensation: string | null;
  nearest_emotion: string;
  /** 活性値上位（最大5件） */
  top_activations: Array<{ emotion: string; activation: number }>;
  since: string;
  last_context: string | null;
  last_updated: string;
}
