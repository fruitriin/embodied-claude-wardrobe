/**
 * substance_state.json の永続化（アトミック書き込み）
 *
 * 破損時の方針: 「1フィールド不正 = 全体 null → ベースライン巻き戻し」にしない。
 * 修復可能なフィールドはベースライン等で個別に修復して stderr に警告を出し、
 * 蓄積された他のフィールドは保全する。ファイル全体が読めないときのみ null。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SUBSTANCE_KEYS, type EmotionState, type SubstanceVector } from "./types";
import { DEFAULT_PROFILE } from "./profile";

export const STATE_FILENAME = "substance_state.json";

export function defaultStatePath(rootDir: string): string {
  return join(rootDir, STATE_FILENAME);
}

function warn(message: string): void {
  console.error(`[emotion-mcp] ${message}`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

/**
 * 読み込み + フィールド単位の修復。
 * - ファイルが無い / JSON として読めない / persona が特定できない → null（作り直し）
 * - substance の不正フィールド → baseline 値で修復し stderr に警告
 * - last_updated 不正 → 現在時刻で修復（過去に飛ばすと decay が全消しするため）
 */
export function loadState(
  path: string,
  baseline: SubstanceVector = DEFAULT_PROFILE.baseline
): EmotionState | null {
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    warn(`state file is not valid JSON, ignoring: ${path}`);
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    warn(`state file is not an object, ignoring: ${path}`);
    return null;
  }
  const raw = parsed as Partial<EmotionState> & Record<string, unknown>;
  if (typeof raw.persona !== "string" || raw.persona.length === 0) {
    warn(`state file has no valid persona, ignoring: ${path}`);
    return null;
  }

  const rawSubstance = (
    typeof raw.substance === "object" && raw.substance !== null ? raw.substance : {}
  ) as Record<string, unknown>;
  const substance = {} as SubstanceVector;
  for (const key of SUBSTANCE_KEYS) {
    const value = rawSubstance[key];
    if (isFiniteNumber(value)) {
      substance[key] = value;
    } else {
      substance[key] = baseline[key];
      warn(`repaired invalid substance.${key} (${String(value)}) with baseline ${baseline[key]}: ${path}`);
    }
  }

  let lastUpdated: string;
  if (isValidIsoDate(raw.last_updated)) {
    lastUpdated = raw.last_updated;
  } else {
    lastUpdated = new Date().toISOString();
    warn(`repaired invalid last_updated (${String(raw.last_updated)}) with current time: ${path}`);
  }

  const activations: Record<string, number> = {};
  if (typeof raw.activations === "object" && raw.activations !== null) {
    for (const [emotion, value] of Object.entries(raw.activations)) {
      if (isFiniteNumber(value)) activations[emotion] = value;
      else warn(`dropped invalid activation ${emotion} (${String(value)}): ${path}`);
    }
  }

  return {
    persona: raw.persona,
    substance,
    activations,
    intrinsic_emotion: typeof raw.intrinsic_emotion === "string" ? raw.intrinsic_emotion : "neutral",
    intrinsic_sensation: typeof raw.intrinsic_sensation === "string" ? raw.intrinsic_sensation : null,
    nearest_emotion: typeof raw.nearest_emotion === "string" ? raw.nearest_emotion : "neutral",
    since: isValidIsoDate(raw.since) ? raw.since : lastUpdated,
    last_context: typeof raw.last_context === "string" ? raw.last_context : null,
    last_updated: lastUpdated,
    recent_deltas: Array.isArray(raw.recent_deltas) ? raw.recent_deltas : [],
  };
}

/** tmp に書いてから rename するアトミック書き込み */
export function saveState(path: string, state: EmotionState): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}
