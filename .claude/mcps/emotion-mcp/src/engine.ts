/**
 * ベクトル移動エンジン（純関数群）
 *
 * substance 4変数の移動・自然減衰（ホメオスタシス）・安全弁・内発的感情判定・
 * 感情遷移（伝播カーブ）を副作用なしで計算する。永続化は persistence.ts が担う。
 * 速度×意識: 高圧縮高速（LLM を挟まない、JSON とスカラー演算のみ）。
 */

import {
  SUBSTANCE_KEYS,
  type EmotionState,
  type IntrinsicConfig,
  type IntrinsicPattern,
  type PersonaProfile,
  type SubstanceKey,
  type SubstanceVector,
} from "./types";
import { EMOTIONS, isEmotion, type Emotion } from "./emotions";
import {
  activationCurve,
  directionCoefficient,
  effectiveDistance,
  type DistanceMatrix,
} from "./distance";

/** 1回の変動上限（テッド準拠、ネガティブスパイラル対策） */
export const PER_UPDATE_CAP = 0.2;
/** 1時間の累積変動上限（テッド準拠） */
export const HOURLY_CAP = 0.4;
/** 安全弁の累積ウィンドウ（分） */
const HOUR_WINDOW_MINUTES = 60;
/** 伝播で書き込む活性値の下限（これ未満は捨てる） */
const ACTIVATION_FLOOR = 0.02;
/** nearest_emotion 判定で活性値を優先する閾値 */
const NEAREST_ACTIVATION_THRESHOLD = 0.05;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function minutesBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, (to.getTime() - from) / 60_000);
}

export function initialState(persona: string, profile: PersonaProfile, now: Date): EmotionState {
  const iso = now.toISOString();
  return {
    persona,
    substance: { ...profile.baseline },
    activations: {},
    intrinsic_emotion: "neutral",
    intrinsic_sensation: null,
    nearest_emotion: "neutral",
    since: iso,
    last_context: null,
    last_updated: iso,
    recent_deltas: [],
  };
}

/**
 * 自然減衰（ベースライン回帰）。
 * 連続指数減衰: ちょうど decay_minutes 経過した時点で decay_rate 分だけ
 * ベースラインに近づく。時間経過に対して単調（メタテスト要件）。
 * 感情活性値は activation_halflife_minutes の半減期で減衰する。
 */
export function applyDecay(state: EmotionState, profile: PersonaProfile, now: Date): EmotionState {
  const elapsed = minutesBetween(state.last_updated, now);
  if (elapsed <= 0) return state;

  const keep = Math.pow(1 - profile.decay_rate, elapsed / profile.decay_minutes);
  const substance = { ...state.substance };
  for (const key of SUBSTANCE_KEYS) {
    const base = profile.baseline[key];
    substance[key] = base + (substance[key] - base) * keep;
  }

  const actKeep = Math.pow(0.5, elapsed / profile.activation_halflife_minutes);
  const activations: Record<string, number> = {};
  for (const [emotion, value] of Object.entries(state.activations)) {
    const decayed = value * actKeep;
    if (decayed >= 0.01) activations[emotion] = decayed;
  }

  return { ...state, substance, activations, last_updated: now.toISOString() };
}

/** 直近1時間ウィンドウ外の delta 履歴を捨てる */
function pruneRecentDeltas(state: EmotionState, now: Date): EmotionState {
  const recent = state.recent_deltas.filter(
    (entry) => minutesBetween(entry.ts, now) < HOUR_WINDOW_MINUTES
  );
  return { ...state, recent_deltas: recent };
}

function hourlySum(state: EmotionState, key: SubstanceKey): number {
  let sum = 0;
  for (const entry of state.recent_deltas) {
    sum += entry.deltas[key] ?? 0;
  }
  return sum;
}

export interface UpdateOptions {
  source?: string; // "user" | "self" | "environment" | ...
  context?: string;
  now: Date;
}

export interface UpdateResult {
  state: EmotionState;
  /** 安全弁・レンジクランプ適用後に実際に反映された delta */
  applied: Partial<Record<SubstanceKey, number>>;
}

/**
 * substance の更新（ベクトル移動）。
 * 適用順: 発言者重み → 方向別移動係数（up/down ゲイン） → 1回上限 ±0.2
 *       → 1時間累積 ±0.4 → [0,1] レンジクランプ。
 * 減衰は安全弁の計上外（ホメオスタシスは「変動」ではない）。
 */
export function updateSubstance(
  state: EmotionState,
  profile: PersonaProfile,
  deltas: Partial<Record<SubstanceKey, number>>,
  intrinsicConfig: IntrinsicConfig,
  options: UpdateOptions
): UpdateResult {
  const { now } = options;
  const source = options.source ?? "self";
  const weight = profile.source_weights[source] ?? 1.0;

  let next = pruneRecentDeltas(applyDecay(state, profile, now), now);
  const substance = { ...next.substance };
  const applied: Partial<Record<SubstanceKey, number>> = {};

  for (const key of SUBSTANCE_KEYS) {
    const raw = deltas[key];
    if (raw === undefined || raw === 0) continue;

    const gain = raw > 0 ? profile.substance_direction_gain[key].up : profile.substance_direction_gain[key].down;
    let d = raw * weight * gain;
    // 安全弁1: 1回の変動上限
    d = clamp(d, -PER_UPDATE_CAP, PER_UPDATE_CAP);
    // 安全弁2: 1時間累積上限（既存の累積を差し引いた残り幅に収める）
    const used = hourlySum(next, key);
    d = clamp(d, -HOURLY_CAP - used, HOURLY_CAP - used);

    const before = substance[key];
    const after = clamp01(before + d);
    const actual = after - before;
    if (actual !== 0) {
      substance[key] = after;
      applied[key] = actual;
    }
  }

  next = {
    ...next,
    substance,
    last_context: options.context ?? next.last_context,
    last_updated: now.toISOString(),
    recent_deltas:
      Object.keys(applied).length > 0
        ? [...next.recent_deltas, { ts: now.toISOString(), deltas: applied }]
        : next.recent_deltas,
  };

  next = refreshDerived(next, profile, intrinsicConfig, now);
  return { state: next, applied };
}

export interface TransitionOptions {
  context?: string;
  now: Date;
}

/**
 * emotion_transition — 意識的な感情の刻み込み。
 * 1. 現在の nearest_emotion（起点）→ target の方向別係数で実効 magnitude を決める
 *    （係数 >1 = その方向に動きにくい）
 * 2. target に活性を立て、伝播カーブ activation = strength * exp(-4 * distance²)
 *    で近傍感情に波及させる。伝播の距離にも方向別係数（target→近傍）がかかる。
 */
export function transitionEmotion(
  state: EmotionState,
  profile: PersonaProfile,
  matrix: DistanceMatrix,
  target: string,
  magnitude: number,
  intrinsicConfig: IntrinsicConfig,
  options: TransitionOptions
): EmotionState {
  if (!isEmotion(target)) {
    throw new Error(`unknown emotion: ${target} (GoEmotions 27感情のいずれかを指定)`);
  }
  const mag = clamp01(magnitude);
  const { now } = options;

  let next = pruneRecentDeltas(applyDecay(state, profile, now), now);

  const origin = isEmotion(next.nearest_emotion) ? (next.nearest_emotion as Emotion) : null;
  const moveCoef =
    origin && origin !== target
      ? directionCoefficient(profile.direction_coefficients, origin, target)
      : 1.0;
  const effMag = clamp01(mag / Math.max(moveCoef, 0.01));

  const activations = { ...next.activations };
  activations[target] = clamp01((activations[target] ?? 0) + effMag);
  for (const emotion of EMOTIONS) {
    if (emotion === target) continue;
    const dEff = effectiveDistance(matrix, profile.direction_coefficients, target, emotion);
    const spread = activationCurve(effMag, dEff);
    if (spread < ACTIVATION_FLOOR) continue;
    activations[emotion] = clamp01((activations[emotion] ?? 0) + spread);
  }

  next = {
    ...next,
    activations,
    last_context: options.context ?? next.last_context,
    last_updated: now.toISOString(),
  };
  return refreshDerived(next, profile, intrinsicConfig, now);
}

/**
 * 内発的感情の判定（条件マッチ、LLM 挟まない）。
 * 条件が全て一致するパターンのうち、条件数が最多のもの（最も特異的なもの）を採る。
 * 例: DA低+5-HT低+ACh低 は restlessness(2条件) より fatigue(3条件) が勝つ。
 */
export function detectIntrinsic(
  substance: SubstanceVector,
  baseline: SubstanceVector,
  config: IntrinsicConfig
): IntrinsicPattern | null {
  const threshold = config.deviation_threshold;
  const matches = (pattern: IntrinsicPattern): boolean => {
    for (const [key, direction] of Object.entries(pattern.conditions)) {
      const k = key as SubstanceKey;
      const deviation = substance[k] - baseline[k];
      if (direction === "high" && deviation < threshold) return false;
      if (direction === "low" && deviation > -threshold) return false;
    }
    return true;
  };

  const sorted = [...config.patterns].sort(
    (a, b) => Object.keys(b.conditions).length - Object.keys(a.conditions).length
  );
  for (const pattern of sorted) {
    if (matches(pattern)) return pattern;
  }
  return null;
}

/**
 * 派生フィールド（intrinsic_emotion / nearest_emotion / since）の再計算。
 * nearest_emotion: 活性値の最大が閾値を超えていればそれ、
 * さもなくば内発的感情のアンカー、どちらも無ければ "neutral"。
 */
export function refreshDerived(
  state: EmotionState,
  profile: PersonaProfile,
  config: IntrinsicConfig,
  now: Date
): EmotionState {
  const pattern = detectIntrinsic(state.substance, profile.baseline, config);
  const intrinsicLabel = pattern?.label ?? "neutral";
  const since = intrinsicLabel === state.intrinsic_emotion ? state.since : now.toISOString();

  let nearest = pattern?.anchor ?? "neutral";
  let best = 0;
  for (const [emotion, value] of Object.entries(state.activations)) {
    if (value > best) {
      best = value;
      if (value >= NEAREST_ACTIVATION_THRESHOLD) nearest = emotion;
    }
  }

  return {
    ...state,
    intrinsic_emotion: intrinsicLabel,
    intrinsic_sensation: pattern?.sensation ?? null,
    nearest_emotion: nearest,
    since,
  };
}
