// journal-external-proposal.ts — 外部提案の台帳に1行追記する
//
// 他の LLM・第三者・記事などから来た設計/行動の提案を、採否を問わず
// 「外部由来」として JSONL に残す。採用した提案も記録することで、
// あとから「自分で考えたのか、言われたのか」を辿れるようにし、
// エコーチェンバーによる静かな漂流を防ぐ。
// /wd-note-external-proposal スキルから呼ばれる。
//
// Usage（正: JSON ファイル経由 — シェル展開を通らないため外部由来テキストに安全）:
//   bun run .claude/scripts/journal-external-proposal.ts --json-file <path> [--log-path <path>]
//   JSON フィールド: source, topic, summary, decision（必須）/ accepted, rejected, notes, url（任意）
//
// 旧引数モード（--source / --topic / --summary 等の直接指定）は default で拒否される（exit 1）。
// このスクリプトの入力はまさに外部由来テキストであり、シェルコマンド文字列への埋め込みは
// 任意コマンド実行のリスクがある。対話的な手動デバッグなど「これは外部由来ではない」と
// 自覚した上で使う場合のみ --allow-legacy-args を明示指定して有効化する。
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
const DEFAULT_LOG_PATH = `${SCRIPT_DIR}/../journals/external_proposals.jsonl`;

const DECISIONS = ["accepted", "partial-accept", "rejected", "deferred", "logged-only"] as const;

function usage(): never {
  console.error(`Usage:
  bun run .claude/scripts/journal-external-proposal.ts --json-file <path> [--log-path <path>]
  JSON フィールド: source, topic, summary, decision（必須）/ accepted, rejected, notes, url（任意）
  decision の enum: ${DECISIONS.join(" | ")}
  [--log-path <path>]  (default: .claude/journals/external_proposals.jsonl)

旧引数モード（--source / --topic / --summary / --decision / --accepted / --rejected /
--notes / --url）は default で拒否される（exit 1）。対話的手動デバッグ等で使う場合のみ
--allow-legacy-args を明示指定して有効化する。外部由来テキストには絶対に使うな。`);
  process.exit(1);
}

let values: Record<string, string | boolean | undefined>;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      source: { type: "string" },
      topic: { type: "string" },
      summary: { type: "string" },
      decision: { type: "string" },
      accepted: { type: "string" },
      rejected: { type: "string" },
      notes: { type: "string" },
      url: { type: "string" },
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

let source: string | undefined;
let topic: string | undefined;
let summary: string | undefined;
let decision: string | undefined;
let accepted: string | undefined;
let rejected: string | undefined;
let notes: string | undefined;
let url: string | undefined;

const jsonFile = values["json-file"] as string | undefined;
if (jsonFile) {
  const FIELD_FLAGS = [
    "source", "topic", "summary", "decision", "accepted", "rejected", "notes", "url",
  ] as const;
  if (FIELD_FLAGS.some((f) => values[f] !== undefined)) {
    console.error("error: --json-file と個別フィールド引数は併用できない");
    process.exit(1);
  }
  if (values["allow-legacy-args"]) {
    console.error("[warn] --allow-legacy-args は --json-file モードでは無視されます");
  }
  const obj = readJsonObjectOrExit(jsonFile);
  rejectUnknownFieldsOrExit(obj, FIELD_FLAGS);
  source = optionalStringFieldOrExit(obj, "source");
  topic = optionalStringFieldOrExit(obj, "topic");
  summary = optionalStringFieldOrExit(obj, "summary");
  decision = optionalStringFieldOrExit(obj, "decision");
  accepted = optionalStringFieldOrExit(obj, "accepted");
  rejected = optionalStringFieldOrExit(obj, "rejected");
  notes = optionalStringFieldOrExit(obj, "notes");
  url = optionalStringFieldOrExit(obj, "url");
} else {
  if (!values["allow-legacy-args"]) {
    console.error(
      "[error] 旧引数モードは default で拒否されます。外部由来テキストはシェル展開経由で任意コマンド実行になるリスクがあります。明示的に許可する場合は --allow-legacy-args を付けてください（例: 対話的手動デバッグ）",
    );
    process.exit(1);
  }
  console.error("[warn] 旧引数モードで実行しました（外部由来テキストに使わないこと）");
  source = values.source as string | undefined;
  topic = values.topic as string | undefined;
  summary = values.summary as string | undefined;
  decision = values.decision as string | undefined;
  accepted = values.accepted as string | undefined;
  rejected = values.rejected as string | undefined;
  notes = values.notes as string | undefined;
  url = values.url as string | undefined;
}

if (!source || !topic || !summary || !decision) {
  console.error("error: source, topic, summary, decision は必須");
  usage();
}
if (!(DECISIONS as readonly string[]).includes(decision)) {
  console.error(`error: --decision は ${DECISIONS.join(" / ")} のいずれか（got: ${decision}）`);
  process.exit(1);
}

const entry = {
  id: makeId("ext"),
  ts: localIsoTimestamp(),
  source,
  topic,
  summary,
  decision,
  accepted: accepted ?? null,
  rejected: rejected ?? null,
  notes: notes ?? null,
  url: url ?? null,
};

appendJournalEntry((values["log-path"] as string | undefined) ?? DEFAULT_LOG_PATH, entry);
console.log(JSON.stringify(entry));
