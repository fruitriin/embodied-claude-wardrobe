/**
 * substance_state.json の永続化（アトミック書き込み）
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SUBSTANCE_KEYS, type EmotionState } from "./types";

export const STATE_FILENAME = "substance_state.json";

export function defaultStatePath(rootDir: string): string {
  return join(rootDir, STATE_FILENAME);
}

function isValidState(value: unknown): value is EmotionState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<EmotionState>;
  if (typeof state.persona !== "string") return false;
  if (typeof state.substance !== "object" || state.substance === null) return false;
  for (const key of SUBSTANCE_KEYS) {
    if (typeof state.substance[key] !== "number") return false;
  }
  if (typeof state.last_updated !== "string") return false;
  return true;
}

/** 読めない・壊れている場合は null（呼び出し側が initialState で作り直す） */
export function loadState(path: string): EmotionState | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!isValidState(parsed)) return null;
    return {
      activations: {},
      intrinsic_emotion: "neutral",
      intrinsic_sensation: null,
      nearest_emotion: "neutral",
      since: parsed.last_updated,
      last_context: null,
      recent_deltas: [],
      ...parsed,
    };
  } catch {
    return null;
  }
}

/** tmp に書いてから rename するアトミック書き込み */
export function saveState(path: string, state: EmotionState): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}
