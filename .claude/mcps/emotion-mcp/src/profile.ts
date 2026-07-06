/**
 * ペルソナプロファイル・内発的感情定義のロード
 *
 * personas/<id>/profile.json は部分指定でよい（デフォルトに deep merge）。
 * 「ベースラインを叩き台に本人が上書き」方式（external-intake-2026-07 Tier 2）。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SUBSTANCE_KEYS,
  type DistanceOverrides,
  type IntrinsicConfig,
  type PersonaProfile,
  type SubstanceKey,
} from "./types";

/** 計画のデフォルトベースライン（ペルソナ固有の気質で上書きする叩き台） */
export const DEFAULT_PROFILE: PersonaProfile = {
  baseline: { DA: 0.6, NA: 0.45, "5-HT": 0.55, ACh: 0.6 },
  decay_rate: 0.15,
  decay_minutes: 30,
  activation_halflife_minutes: 30,
  source_weights: { user: 1.5, self: 1.0, environment: 1.0 },
  substance_direction_gain: {
    DA: { up: 1.0, down: 1.0 },
    NA: { up: 1.0, down: 1.0 },
    "5-HT": { up: 1.0, down: 1.0 },
    ACh: { up: 1.0, down: 1.0 },
  },
  direction_coefficients: { valence: {}, pairs: {} },
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** 部分指定の profile.json をデフォルトへ deep merge する */
export function mergeProfile(partial: Partial<PersonaProfile> | null): PersonaProfile {
  if (!partial) return structuredClone(DEFAULT_PROFILE);
  const base = structuredClone(DEFAULT_PROFILE);
  const gain = { ...base.substance_direction_gain };
  if (partial.substance_direction_gain) {
    for (const key of SUBSTANCE_KEYS) {
      const override = partial.substance_direction_gain[key as SubstanceKey];
      if (override) gain[key] = { ...gain[key], ...override };
    }
  }
  return {
    baseline: { ...base.baseline, ...partial.baseline },
    decay_rate: partial.decay_rate ?? base.decay_rate,
    decay_minutes: partial.decay_minutes ?? base.decay_minutes,
    activation_halflife_minutes:
      partial.activation_halflife_minutes ?? base.activation_halflife_minutes,
    source_weights: { ...base.source_weights, ...partial.source_weights },
    substance_direction_gain: gain,
    direction_coefficients: {
      valence: { ...base.direction_coefficients.valence, ...partial.direction_coefficients?.valence },
      pairs: { ...base.direction_coefficients.pairs, ...partial.direction_coefficients?.pairs },
    },
  };
}

export function loadProfile(personasDir: string, personaId: string): PersonaProfile {
  return mergeProfile(readJson<Partial<PersonaProfile>>(join(personasDir, personaId, "profile.json")));
}

export function loadDistanceOverrides(personasDir: string, personaId: string): DistanceOverrides | undefined {
  return readJson<DistanceOverrides>(join(personasDir, personaId, "distances.json")) ?? undefined;
}

/** 内発的感情パターンが読めないときのフォールバック（intrinsic-patterns.json と同内容） */
export const DEFAULT_INTRINSIC: IntrinsicConfig = {
  deviation_threshold: 0.08,
  patterns: [
    {
      label: "restlessness",
      conditions: { DA: "low", "5-HT": "low" },
      sensation: "落ち着かない。何か忘れてる気がする",
      anchor: "nervousness",
    },
    {
      label: "contentment",
      conditions: { "5-HT": "high", NA: "low" },
      sensation: "穏やかだ。今のままでいい",
      anchor: "relief",
    },
    {
      label: "fatigue",
      conditions: { DA: "low", "5-HT": "low", ACh: "low" },
      sensation: "頭がぼんやり。少し休みたい",
      anchor: "neutral",
    },
    {
      label: "thrill",
      conditions: { DA: "high", NA: "high" },
      sensation: "心臓が速い。何か起きてる",
      anchor: "excitement",
    },
    {
      label: "curiosity",
      conditions: { DA: "high", ACh: "high" },
      sensation: "何か面白いものを探したい",
      anchor: "curiosity",
    },
  ],
};

export function loadIntrinsicConfig(rootDir: string): IntrinsicConfig {
  return readJson<IntrinsicConfig>(join(rootDir, "intrinsic-patterns.json")) ?? structuredClone(DEFAULT_INTRINSIC);
}
