// journal-external-proposal.ts — 外部提案の台帳に1行追記する
//
// 他の LLM・第三者・記事などから来た設計/行動の提案を、採否を問わず
// 「外部由来」として JSONL に残す。採用した提案も記録することで、
// あとから「自分で考えたのか、言われたのか」を辿れるようにし、
// エコーチェンバーによる静かな漂流を防ぐ。
// /wd-note-external-proposal スキルから呼ばれる。
//
// Usage（唯一の経路 — シェル展開を通らないため外部由来テキストに安全）:
//   bun run .claude/scripts/journal-external-proposal.ts --json-file <path> [--log-path <path>]
//   JSON フィールド: source, topic, summary, decision（必須）/ accepted, rejected, notes, url（任意）
//
// 歴史的な理由: 以前は --source / --summary 等の個別フィールド引数と
// --allow-legacy-args による明示許可モードを備えていたが、
// このスクリプトの入力はまさに外部由来テキストであり、シェルコマンド文字列への
// 埋め込みは任意コマンド実行のリスクがある。「バイパスの公式手段」化を避けるため、
// v0.5.1 以降は --json-file 専用に一本化した。
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

必須オプション:
  --json-file <path>   フィールドを JSON オブジェクトで書いたファイルのパス
                       JSON フィールド: source, topic, summary, decision（必須）
                                       accepted, rejected, notes, url（任意）
                       decision の enum: ${DECISIONS.join(" | ")}

任意オプション:
  --log-path <path>    出力先 JSONL（default: .claude/journals/external_proposals.jsonl）
  -h, --help           このヘルプを表示

歴史的な理由: 以前は --source 等の個別引数と --allow-legacy-args による明示許可
モードがあったが、外部由来テキストのシェル埋め込みリスクを根絶するため
v0.5.1 以降は --json-file 専用。個別引数は未知のオプションとして拒否される。`);
  process.exit(1);
}

let values: Record<string, string | boolean | undefined>;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "json-file": { type: "string" },
      "log-path": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (e) {
  // parseArgs は default で strict モード（未知のオプションを拒否）。
  // 旧引数（--source / --summary / --allow-legacy-args 等）はここで捕捉される。
  console.error(`[error] ${e instanceof Error ? e.message : e}`);
  console.error(
    "[error] 個別フィールド引数（--source / --topic / --summary / --decision 等）と --allow-legacy-args は v0.5.1 で撤廃されました。--json-file <path> を使ってください（Write ツールで一時 JSON を書いて渡すのが正の経路）。",
  );
  process.exit(1);
}

if (values.help) usage();

const jsonFile = values["json-file"] as string | undefined;
if (!jsonFile) {
  console.error(
    "[error] --json-file <path> は必須です。フィールドを JSON オブジェクトで書いたファイルを渡してください（Write ツールで一時 JSON を書いて渡すのが正の経路）。",
  );
  process.exit(1);
}

const ALLOWED_FIELDS = [
  "source", "topic", "summary", "decision", "accepted", "rejected", "notes", "url",
] as const;
const obj = readJsonObjectOrExit(jsonFile);
rejectUnknownFieldsOrExit(obj, ALLOWED_FIELDS);
const source = optionalStringFieldOrExit(obj, "source");
const topic = optionalStringFieldOrExit(obj, "topic");
const summary = optionalStringFieldOrExit(obj, "summary");
const decision = optionalStringFieldOrExit(obj, "decision");
const accepted = optionalStringFieldOrExit(obj, "accepted");
const rejected = optionalStringFieldOrExit(obj, "rejected");
const notes = optionalStringFieldOrExit(obj, "notes");
const url = optionalStringFieldOrExit(obj, "url");

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
