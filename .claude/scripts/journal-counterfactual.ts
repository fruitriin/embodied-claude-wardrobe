// journal-counterfactual.ts — 反実仮想の台帳に1行追記する
//
// 「やりたかった X / 選んだ Y / 理由 Z」を JSONL で残す。
// やらなかったことの記録は、やったことの記録と同じくらい自己の連続性に効く。
// /wd-note-counterfactual スキルから呼ばれる。
//
// Usage（推奨: JSON ファイル経由 — シェル展開を通らないため外部由来テキストに安全）:
//   bun run .claude/scripts/journal-counterfactual.ts --json-file <path> [--log-path <path>]
//   JSON フィールド: wanted, chose, why（必須）/ trigger, person_id, regret（任意）
//
// Usage（互換: 引数直接指定 — テキストをシェルコマンド文字列に埋め込むため、
// 外部由来テキストには使わないこと）:
//   bun run .claude/scripts/journal-counterfactual.ts \
//     --wanted "話しかけたかった" \
//     --chose  "黙って待った" \
//     --why    "深夜帯で、以前『作業中は割り込まないで』と言われていた" \
//     [--trigger "振り返り"] [--person-id "riin"] [--regret 0.2] [--log-path <path>]
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
  console.error(`Usage（推奨: シェル展開を通らないため外部由来テキストに安全）:
  bun run .claude/scripts/journal-counterfactual.ts --json-file <path> [--log-path <path>]
  JSON フィールド: wanted, chose, why（必須）/ trigger, person_id, regret（任意）

Usage（互換: 外部由来テキストには使わないこと）:
  bun run .claude/scripts/journal-counterfactual.ts \\
  --wanted "<やりたかったこと>" \\
  --chose  "<実際に選んだこと>" \\
  --why    "<なぜその選択をしたか>" \\
  [--trigger "<きっかけの欲望・状況>"] \\
  [--person-id "<関係した人>"] \\
  [--regret <0-1>] \\
  [--log-path <path>]  (default: .claude/journals/counterfactuals.jsonl)`);
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
