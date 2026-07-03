/**
 * 操作面 — emotion_get / substance_update / emotion_transition 相当
 *
 * Layer 1 はコアライブラリ + CLI。Layer 2 以降で index.ts に MCP サーバーとして
 * 同じ API を露出する（応答に効く経路は同期・数百ms、ログ蓄積は非同期の切り分け方針）。
 */

import { existsSync } from "node:fs";
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
import { LEGACY_STATE_FILENAME, defaultStatePath, loadState, saveState } from "./persistence";
import { withFileLock } from "./lock";

/**
 * rootDir のデフォルト解決（memory-mcp の config.py と同じ優先順位）:
 * 1. CLAUDE_PROJECT_DIR 環境変数 → <project>/.claude/mcps/emotion-mcp
 * 2. このパッケージ自身のディレクトリ（src/ の親）
 */
export function resolveRootDir(): string {
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (projectDir) return join(projectDir, ".claude", "mcps", "emotion-mcp");
  return join(import.meta.dir, "..");
}

export interface EmotionApiOptions {
  /**
   * emotion-mcp のルート（intrinsic-patterns.json / personas/ / 状態ファイルの基準）。
   * 省略時は resolveRootDir()（CLAUDE_PROJECT_DIR 優先）
   */
  rootDir?: string;
  personaId?: string;
  /** 状態ファイルの置き場所を上書き（テスト用） */
  statePath?: string;
  /** 時計の注入（テスト用）。省略時は実時間 */
  now?: () => Date;
}

export interface EmotionApi {
  /**
   * 現在状態のスナップショット（decay 反映済みの読み取り専用ビュー）。
   * デフォルトでは書き込まない。decay 反映を永続化したいときのみ sync: true
   * （ロックを取って書き戻す）。
   */
  get(options?: { sync?: boolean }): EmotionSnapshot;
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
  const rootDir = options.rootDir ?? resolveRootDir();
  const personaId = options.personaId ?? "default";
  const statePath = options.statePath ?? defaultStatePath(rootDir, personaId);
  const clock = options.now ?? (() => new Date());

  const personasDir = join(rootDir, "personas");
  const profile = loadProfile(personasDir, personaId);
  const intrinsic = loadIntrinsicConfig(rootDir);
  const matrix = buildDistanceMatrix(loadDistanceOverrides(personasDir, personaId));

  /**
   * persona フィールドは整合性スタンプ。不一致はサイレント initialState 差し替えではなく
   * 明示エラー（別ペルソナの状態を黙って捨てる/上書きする事故を防ぐ）。
   */
  const load = (now: Date): EmotionState => {
    const state = loadState(statePath, profile.baseline);
    if (state) {
      if (state.persona !== personaId) {
        throw new Error(
          `persona mismatch: state file ${statePath} belongs to persona "${state.persona}", ` +
            `not "${personaId}". ペルソナごとに別ディレクトリ（または --state）を使うこと`
        );
      }
      return state;
    }
    // 旧レイアウト（substance_state.json）からの一度だけの読み替え移行。
    // persona が一致する場合のみ。次の保存で新パスに書かれ、以後旧ファイルは参照されない
    if (!options.statePath) {
      const legacyPath = join(rootDir, LEGACY_STATE_FILENAME);
      if (existsSync(legacyPath)) {
        const legacy = loadState(legacyPath, profile.baseline);
        if (legacy && legacy.persona === personaId) {
          console.error(`[emotion-mcp] migrating legacy state ${legacyPath} -> ${statePath}`);
          saveState(statePath, legacy);
          return legacy;
        }
      }
    }
    return initialState(personaId, profile, now);
  };

  const lockPath = `${statePath}.lock`;

  return {
    statePath,

    get(opts = {}) {
      const view = () => {
        const now = clock();
        let state = applyDecay(load(now), profile, now);
        state = refreshDerived(state, profile, intrinsic, now);
        return state;
      };
      if (!opts.sync) {
        // 読み取り専用ビュー: decay は読み出しのたび決定的に再計算されるので
        // 書き戻さなくても値は一貫する。暗黙の saveState はしない
        return toSnapshot(view(), profile.baseline);
      }
      // --sync: decay 反映を永続化する（書くので read-modify-write をロックで直列化）
      return withFileLock(lockPath, () => {
        const state = view();
        saveState(statePath, state);
        return toSnapshot(state, profile.baseline);
      });
    },

    update(deltas, opts = {}) {
      // load → 計算 → save をロックで直列化（並行呼び出しのロストアップデート防止）。
      // 返すスナップショットは保存した状態そのもの（保存されなかった値を成功として返さない）
      return withFileLock(lockPath, () => {
        const now = clock();
        const { state } = updateSubstance(load(now), profile, deltas, intrinsic, {
          source: opts.source,
          context: opts.context,
          now,
        });
        saveState(statePath, state);
        return toSnapshot(state, profile.baseline);
      });
    },

    transition(target, magnitude, context) {
      return withFileLock(lockPath, () => {
        const now = clock();
        const state = transitionEmotion(load(now), profile, matrix, target, magnitude, intrinsic, {
          context,
          now,
        });
        saveState(statePath, state);
        return toSnapshot(state, profile.baseline);
      });
    },
  };
}
