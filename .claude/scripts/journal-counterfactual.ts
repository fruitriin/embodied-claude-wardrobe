// journal-counterfactual.ts — 反実仮想の台帳に1行追記する
//
// 「やりたかった X / 選んだ Y / 理由 Z」を JSONL で残す。
// やらなかったことの記録は、やったことの記録と同じくらい自己の連続性に効く。
// /wd-note-counterfactual スキルから呼ばれる。
//
// Usage（正: JSON ファイル経由 — シェル展開を通らないため外部由来テキストに安全）:
//   bun run .claude/scripts/journal-counterfactual.ts --json-file <path> [--log-path <path>]
//   JSON フィールド: wanted, chose, why（必須）/ trigger, person_id, regret（任意）
//
// 旧引数モード（--wanted 等の直接指定）は default で拒否される（exit 1）。
// 外部由来テキストをシェルコマンド文字列へ埋め込むと任意コマンド実行のリスクがあるため、
// 対話的な手動デバッグなど「これは外部由来ではない」と自覚した上で使う場合のみ
// --allow-legacy-args を明示指定して有効化する。
import { parseArgs } from "node:util";
import {
  appendJournalEntry,
  localIsoTimestamp,
  makeId,
  optionalStringFieldOrExit,
  readJsonObjectOrExit,
  rejectUnknownFieldsOrExit,
} from "./journal-lib";

const SCRIPT_DIR = import.meta.dir;
const DEFAULT_LOG_PATH = `${SCRIPT_DIR}/../journals/counterfactuals.jsonl`;

function usage(): never {
  console.error(`Usage:
  bun run .claude/scripts/journal-counterfactual.ts --json-file <path> [--log-path <path>]
  JSON フィールド: wanted, chose, why（必須）/ trigger, person_id, regret（任意）
  [--log-path <path>]  (default: .claude/journals/counterfactuals.jsonl)

旧引数モード（--wanted / --chose / --why / --trigger / --person-id / --regret）は
default で拒否される（exit 1）。対話的手動デバッグ等で使う場合のみ
--allow-legacy-args を明示指定して有効化する。外部由来テキストには絶対に使うな。`);
  process.exit(1);
}

let values: Record<string, string | boolean | undefined>;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      wanted: { type: "string" },
      chose: { type: "string" },
      why: { type: "string" },
      trigger: { type: "string" },
      "person-id": { type: "string" },
      regret: { type: "string" },
      "json-file": { type: "string" },
      "log-path": { type: "string" },
      "allow-legacy-args": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  usage();
}

if (values.help) usage();

let wanted: string | undefined;
let chose: string | undefined;
let why: string | undefined;
let trigger: string | undefined;
let personId: string | undefined;
let regretRaw: string | number | undefined;

const jsonFile = values["json-file"] as string | undefined;
if (jsonFile) {
  const FIELD_FLAGS = ["wanted", "chose", "why", "trigger", "person-id", "regret"] as const;
  if (FIELD_FLAGS.some((f) => values[f] !== undefined)) {
    console.error("error: --json-file と個別フィールド引数は併用できない");
    process.exit(1);
  }
  if (values["allow-legacy-args"]) {
    console.error("[warn] --allow-legacy-args は --json-file モードでは無視されます");
  }
  const obj = readJsonObjectOrExit(jsonFile);
  rejectUnknownFieldsOrExit(obj, ["wanted", "chose", "why", "trigger", "person_id", "regret"]);
  wanted = optionalStringFieldOrExit(obj, "wanted");
  chose = optionalStringFieldOrExit(obj, "chose");
  why = optionalStringFieldOrExit(obj, "why");
  trigger = optionalStringFieldOrExit(obj, "trigger");
  personId = optionalStringFieldOrExit(obj, "person_id");
  if (obj.regret !== undefined && obj.regret !== null) {
    if (typeof obj.regret !== "number" && typeof obj.regret !== "string") {
      console.error(`error: --json-file のフィールド regret は数値である必要がある（got: ${typeof obj.regret}）`);
      process.exit(1);
    }
    regretRaw = obj.regret;
  }
} else {
  if (!values["allow-legacy-args"]) {
    console.error(
      "[error] 旧引数モードは default で拒否されます。外部由来テキストはシェル展開経由で任意コマンド実行になるリスクがあります。明示的に許可する場合は --allow-legacy-args を付けてください（例: 対話的手動デバッグ）",
    );
    process.exit(1);
  }
  console.error("[warn] 旧引数モードで実行しました（外部由来テキストに使わないこと）");
  wanted = values.wanted as string | undefined;
  chose = values.chose as string | undefined;
  why = values.why as string | undefined;
  trigger = values.trigger as string | undefined;
  personId = values["person-id"] as string | undefined;
  regretRaw = values.regret as string | undefined;
}

if (!wanted || !chose || !why) {
  console.error("error: wanted, chose, why は必須");
  usage();
}

let regret: number | null = null;
if (regretRaw !== undefined) {
  regret = Number(regretRaw);
  if (!Number.isFinite(regret) || regret < 0 || regret > 1) {
    console.error(`error: regret は 0〜1 の範囲で指定する（got: ${regretRaw}）`);
    process.exit(1);
  }
}

const entry = {
  id: makeId("cf"),
  ts: localIsoTimestamp(),
  wanted,
  chose,
  why,
  trigger: trigger ?? null,
  person_id: personId ?? null,
  regret,
};

appendJournalEntry((values["log-path"] as string | undefined) ?? DEFAULT_LOG_PATH, entry);
console.log(JSON.stringify(entry));
