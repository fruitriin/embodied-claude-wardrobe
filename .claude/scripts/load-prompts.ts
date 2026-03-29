#!/usr/bin/env bun
/**
 * load-prompts.ts
 * prompts.toml からプロンプト設定を読み込んで出力する。
 *
 * Usage:
 *   bun run .claude/scripts/load-prompts.ts <key>
 *
 * Keys:
 *   time_rule_night       -- [time_rules].night
 *   time_rule_day         -- [time_rules].day
 *   routine_routine       -- [routine_mode].routine
 *   routine_normal        -- [routine_mode].normal
 *   morning_section       -- [morning] を組み立てた文字列
 *   desire_footer         -- [desire].footer
 *   prompt_template       -- [prompt].template（プレースホルダはそのまま）
 *
 * ファイルが存在しないか、キーが見つからない場合はデフォルト値を返す。
 */

// Bun には toml パーサーがないため、シンプルな自前パーサーを実装
// 対象は prompts.toml の構造に特化した最小実装

type TomlValue = string | string[] | { [key: string]: TomlValue };
type TomlDoc = { [section: string]: { [key: string]: TomlValue } };

function parseToml(text: string): TomlDoc {
  const doc: TomlDoc = {};
  let currentSection = "";
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // コメント・空行スキップ
    if (line === "" || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }

    // セクションヘッダ
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!doc[currentSection]) doc[currentSection] = {};
      i++;
      continue;
    }

    // キー = 値
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) { i++; continue; }

    const key = line.slice(0, eqIdx).trim();
    let valueStr = line.slice(eqIdx + 1).trim();

    // 複数行文字列 """ ... """
    if (valueStr.startsWith('"""')) {
      const parts: string[] = [];
      valueStr = valueStr.slice(3);
      // 同一行で閉じているか
      if (valueStr.includes('"""')) {
        const closeIdx = valueStr.indexOf('"""');
        parts.push(valueStr.slice(0, closeIdx));
      } else {
        parts.push(valueStr);
        i++;
        while (i < lines.length) {
          const ml = lines[i];
          const closeIdx = ml.indexOf('"""');
          if (closeIdx !== -1) {
            parts.push(ml.slice(0, closeIdx));
            break;
          }
          parts.push(ml);
          i++;
        }
      }
      const raw = parts.join("\n");
      // 先頭の改行を除去（TOML 仕様）
      const val = raw.startsWith("\n") ? raw.slice(1) : raw;
      if (currentSection && key) {
        (doc[currentSection] as Record<string, TomlValue>)[key] = val;
      }
      i++;
      continue;
    }

    // 配列 [ ... ] （複数行対応）
    if (valueStr.startsWith("[")) {
      const arr: string[] = [];
      let arrStr = valueStr;
      if (!arrStr.includes("]")) {
        i++;
        while (i < lines.length) {
          arrStr += lines[i].trimEnd();
          if (arrStr.includes("]")) break;
          i++;
        }
      }
      // 中身を抽出してカンマ区切りに
      const inner = arrStr.replace(/^\[/, "").replace(/\].*$/, "");
      for (const item of inner.split(",")) {
        const s = item.trim();
        if (s === "") continue;
        if (s.startsWith('"') && s.endsWith('"')) {
          arr.push(s.slice(1, -1));
        } else if (s.startsWith("'") && s.endsWith("'")) {
          arr.push(s.slice(1, -1));
        } else if (s.length > 0) {
          arr.push(s);
        }
      }
      if (currentSection && key) {
        (doc[currentSection] as Record<string, TomlValue>)[key] = arr;
      }
      i++;
      continue;
    }

    // 通常文字列
    let val: string;
    if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
      // ダブルクォート文字列: TOML エスケープシーケンスを解釈
      val = valueStr.slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
      // シングルクォート文字列: エスケープなし（リテラル）
      val = valueStr.slice(1, -1);
    } else {
      val = valueStr;
    }

    if (currentSection && key) {
      (doc[currentSection] as Record<string, TomlValue>)[key] = val;
    }
    i++;
  }

  return doc;
}

// --- デフォルト値 ---
const DEFAULTS: Record<string, string> = {
  time_rule_night:
    "現在は深夜帯。tts は使わないこと。静かに自律タスクのみ実行すること。",
  time_rule_day:
    "マスターに伝えたいことがあるときは tts を使ってよい。",
  routine_routine:
    "今回はルーチン回。ROUTINES.md を読んで、最終実行日から間隔が空いたものを一つ選んで実行せよ。実行したら最終実行日を更新すること。",
  routine_normal:
    "通常回。BOOT_SHUTDOWN.md の手順を念頭に、TODO.md からタスクを一つ選んで実行せよ。",
  morning_section:
    "## 今日の初回セッション\n今日の最初の召喚だ。以下を実施せよ：\n1. /wd-great-recall で多軸想起を実行（直近の重要な決定・未完了タスク・curiosity_target）\n2. 前日のタスクを確認し、今日の方針を決めよ\n3. curiosity_target があれば bun run .claude/scripts/desire-tick.ts set-curiosity で注入せよ\n",
  desire_footer:
    "（これは内なる衝動であり、従うかどうかはエージェントの判断。主たるタスクの妨げにならぬ範囲で。）",
  prompt_template: `自律行動（定期巡回）

@SOUL.md
@BOOT_SHUTDOWN.md
@TODO.md
@ROUTINES.md

{MORNING_SECTION}{ROUTINE_MODE}

{DESIRE_SECTION}## 補足ルール
- {TIME_RULE}
- MCPが動作していなければ、デバッグのために関係があると思われる要素をallowedToolsの範囲で調査せよ
{INTEROCEPTION}{RECALL_LITE}`,
};

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error(
      "Usage: bun load-prompts.ts <key>\n" +
        "Keys: " +
        Object.keys(DEFAULTS).join(", ")
    );
    process.exit(1);
  }

  // prompts.toml のパス（このスクリプトの2階層上）
  const scriptDir = import.meta.dir;
  const tomlPath = `${scriptDir}/../../prompts.toml`;

  let doc: TomlDoc = {};
  try {
    const text = await Bun.file(tomlPath).text();
    doc = parseToml(text);
  } catch {
    // ファイルが存在しない場合はデフォルトにフォールバック
  }

  let result: string = DEFAULTS[key] ?? "";

  switch (key) {
    case "time_rule_night":
      result =
        (doc["time_rules"]?.["night"] as string | undefined) ??
        DEFAULTS.time_rule_night;
      break;
    case "time_rule_day":
      result =
        (doc["time_rules"]?.["day"] as string | undefined) ??
        DEFAULTS.time_rule_day;
      break;
    case "routine_routine":
      result =
        (doc["routine_mode"]?.["routine"] as string | undefined) ??
        DEFAULTS.routine_routine;
      break;
    case "routine_normal":
      result =
        (doc["routine_mode"]?.["normal"] as string | undefined) ??
        DEFAULTS.routine_normal;
      break;
    case "morning_section": {
      const header =
        (doc["morning"]?.["header"] as string | undefined) ??
        "## 今日の初回セッション\n今日の最初の召喚だ。以下を実施せよ：";
      const steps =
        (doc["morning"]?.["steps"] as string[] | undefined) ?? [
          "/wd-great-recall で多軸想起を実行（直近の重要な決定・未完了タスク・curiosity_target）",
          "前日のタスクを確認し、今日の方針を決めよ",
          "curiosity_target があれば bun run .claude/scripts/desire-tick.ts set-curiosity で注入せよ",
        ];
      const stepsStr = steps
        .map((s, idx) => `${idx + 1}. ${s}`)
        .join("\n");
      result = `${header}\n${stepsStr}\n`;
      break;
    }
    case "desire_footer":
      result =
        (doc["desire"]?.["footer"] as string | undefined) ??
        DEFAULTS.desire_footer;
      break;
    case "prompt_template":
      result =
        (doc["prompt"]?.["template"] as string | undefined) ??
        DEFAULTS.prompt_template;
      break;
    default:
      console.error(`Unknown key: ${key}`);
      process.exit(1);
  }

  // 末尾改行なしで出力（シェル側でコマンド置換するため）
  process.stdout.write(result);
}

main();
