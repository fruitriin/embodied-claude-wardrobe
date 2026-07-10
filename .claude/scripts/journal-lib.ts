// journal-lib.ts — 非退行台帳（JSONL）の共通ヘルパー
// journal-counterfactual.ts / journal-external-proposal.ts から使う。
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface JournalEntry {
  id: string;
  ts: string;
  [key: string]: unknown;
}

/** `cf_a1b2c3d4` のような短い ID を作る */
export function makeId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

/** ローカルタイムゾーン付き ISO 8601（秒精度）。例: 2026-07-03T14:05:09+09:00 */
// タイムスタンプ方針: journal 系は「人間が読み返す台帳」のため、意図的にローカル
// タイムゾーン付き ISO（例: 2026-07-03T21:30:00+09:00）を使う。演算に使う
// memory-mcp / emotion-mcp は UTC 統一（naive/aware 混在バグ対策）で、これとは別方針。
// 使い分けの経緯: .claude/addf/knowhow/wardrobe/timestamp-policy.md
export function localIsoTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    offset
  );
}

/** 親ディレクトリを作ってから JSONL に1行追記する */
export function appendJournalEntry(logPath: string, entry: JournalEntry): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

/**
 * --json-file モードの入力ファイルを読み、トップレベルがオブジェクトであることを
 * 確認して返す。読めない・JSON でない・オブジェクトでない場合は exit 1。
 *
 * なぜ JSON ファイル経由か: 外部由来テキスト（提案の要約・拒否理由など）を
 * Bash コマンド文字列に直接埋め込むと、`";` やバッククォート・`$()` が
 * シェルに解釈されて任意コマンド実行になる。ファイル経由ならシェル展開を
 * 通らないため、メタ文字はただの文字列として記録される。
 */
export function readJsonObjectOrExit(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    console.error(`error: --json-file を読めない: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`error: --json-file が JSON として不正: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.error("error: --json-file のトップレベルは JSON オブジェクトである必要がある");
    process.exit(1);
  }
  return parsed as Record<string, unknown>;
}

/** JSON 入力の任意文字列フィールドを取り出す。文字列以外（null/undefined を除く）は exit 1 */
export function optionalStringFieldOrExit(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    console.error(`error: --json-file のフィールド ${key} は文字列である必要がある（got: ${typeof v}）`);
    process.exit(1);
  }
  return v;
}

/** JSON 入力に未知のフィールドがあれば exit 1（タイポの早期検出） */
export function rejectUnknownFieldsOrExit(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      console.error(
        `error: --json-file に未知のフィールド: ${key}（使えるのは ${allowed.join(", ")}）`,
      );
      process.exit(1);
    }
  }
}
