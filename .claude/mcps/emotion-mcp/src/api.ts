/**
 * 操作面 — emotion_get / substance_update / emotion_transition 相当
 *
 * Layer 1 はコアライブラリ + CLI。Layer 2 以降で index.ts に MCP サーバーとして
 * 同じ API を露出する（応答に効く経路は同期・数百ms、ログ蓄積は非同期の切り分け方針）。
 */

import { join } from "node:path";
import type { EmotionSnapshot, EmotionState, SubstanceKey } from "./types";
import { buildDistanceMatrix } from "./distance";
import {
  applyDecay,
  initialState,
  refreshDerived,
  transitionEmotion,
  updateSubstance,
} from "./engine";
import { loadDistanceOverrides, loadIntrinsicConfig, loadProfile } from "./profile";
import { defaultStatePath, loadState, saveState } from "./persistence";

export interface EmotionApiOptions {
  /** emotion-mcp のルート（intrinsic-patterns.json / personas/ / substance_state.json の基準） */
  rootDir: string;
  personaId?: string;
  /** 状態ファイルの置き場所を上書き（テスト用） */
  statePath?: string;
  /** 時計の注入（テスト用）。省略時は実時間 */
  now?: () => Date;
}

export interface EmotionApi {
  get(): EmotionSnapshot;
  update(
    deltas: Partial<Record<SubstanceKey, number>>,
    options?: { source?: string; context?: string }
  ): EmotionSnapshot;
  transition(target: string, magnitude: number, context?: string): EmotionSnapshot;
  statePath: string;
}

function toSnapshot(state: EmotionState, baseline: EmotionSnapshot["baseline"]): EmotionSnapshot {
  const top = Object.entries(state.activations)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([emotion, activation]) => ({ emotion, activation: Number(activation.toFixed(4)) }));
  return {
    persona: state.persona,
    substance: { ...state.substance },
    baseline: { ...baseline },
    intrinsic_emotion: state.intrinsic_emotion,
    intrinsic_sensation: state.intrinsic_sensation,
    nearest_emotion: state.nearest_emotion,
    top_activations: top,
    since: state.since,
    last_context: state.last_context,
    last_updated: state.last_updated,
  };
}

export function createEmotionApi(options: EmotionApiOptions): EmotionApi {
  const rootDir = options.rootDir;
  const personaId = options.personaId ?? "default";
  const statePath = options.statePath ?? defaultStatePath(rootDir);
  const clock = options.now ?? (() => new Date());

  const personasDir = join(rootDir, "personas");
  const profile = loadProfile(personasDir, personaId);
  const intrinsic = loadIntrinsicConfig(rootDir);
  const matrix = buildDistanceMatrix(loadDistanceOverrides(personasDir, personaId));

  const load = (now: Date): EmotionState => {
    const state = loadState(statePath);
    if (state && state.persona === personaId) return state;
    return initialState(personaId, profile, now);
  };

  return {
    statePath,

    get() {
      const now = clock();
      let state = applyDecay(load(now), profile, now);
      state = refreshDerived(state, profile, intrinsic, now);
      saveState(statePath, state);
      return toSnapshot(state, profile.baseline);
    },

    update(deltas, opts = {}) {
      const now = clock();
      const { state } = updateSubstance(load(now), profile, deltas, intrinsic, {
        source: opts.source,
        context: opts.context,
        now,
      });
      saveState(statePath, state);
      return toSnapshot(state, profile.baseline);
    },

    transition(target, magnitude, context) {
      const now = clock();
      const state = transitionEmotion(load(now), profile, matrix, target, magnitude, intrinsic, {
        context,
        now,
      });
      saveState(statePath, state);
      return toSnapshot(state, profile.baseline);
    },
  };
}
