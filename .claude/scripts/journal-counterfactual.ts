// journal-counterfactual.ts — 反実仮想の台帳に1行追記する
//
// 「やりたかった X / 選んだ Y / 理由 Z」を JSONL で残す。
// やらなかったことの記録は、やったことの記録と同じくらい自己の連続性に効く。
// /wd-note-counterfactual スキルから呼ばれる。
//
// Usage（唯一の経路 — シェル展開を通らないため外部由来テキストに安全）:
//   bun run .claude/scripts/journal-counterfactual.ts --json-file <path> [--log-path <path>]
//   JSON フィールド: wanted, chose, why（必須）/ trigger, person_id, regret（任意）
//
// 歴史的な理由: 以前は --wanted 等の個別フィールド引数と --allow-legacy-args による
// 明示許可モードを備えていたが、外部由来テキストのシェル埋め込みリスク（任意コマンド実行）
// と「バイパスの公式手段」化を避けるため、v0.5.1 以降は --json-file 専用に一本化した。
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

必須オプション:
  --json-file <path>   フィールドを JSON オブジェクトで書いたファイルのパス
                       JSON フィールド: wanted, chose, why（必須）
                                       trigger, person_id, regret（任意）

任意オプション:
  --log-path <path>    出力先 JSONL（default: .claude/journals/counterfactuals.jsonl）
  -h, --help           このヘルプを表示

歴史的な理由: 以前は --wanted 等の個別引数と --allow-legacy-args による明示許可
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
  // 旧引数（--wanted / --allow-legacy-args 等）はここで捕捉される。
  console.error(`[error] ${e instanceof Error ? e.message : e}`);
  console.error(
    "[error] 個別フィールド引数（--wanted / --chose / --why 等）と --allow-legacy-args は v0.5.1 で撤廃されました。--json-file <path> を使ってください（Write ツールで一時 JSON を書いて渡すのが正の経路）。",
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

const obj = readJsonObjectOrExit(jsonFile);
rejectUnknownFieldsOrExit(obj, ["wanted", "chose", "why", "trigger", "person_id", "regret"]);
const wanted = optionalStringFieldOrExit(obj, "wanted");
const chose = optionalStringFieldOrExit(obj, "chose");
const why = optionalStringFieldOrExit(obj, "why");
const trigger = optionalStringFieldOrExit(obj, "trigger");
const personId = optionalStringFieldOrExit(obj, "person_id");
let regretRaw: string | number | undefined;
if (obj.regret !== undefined && obj.regret !== null) {
  if (typeof obj.regret !== "number" && typeof obj.regret !== "string") {
    console.error(`error: --json-file のフィールド regret は数値である必要がある（got: ${typeof obj.regret}）`);
    process.exit(1);
  }
  regretRaw = obj.regret;
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
