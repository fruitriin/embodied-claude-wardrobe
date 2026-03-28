#!/usr/bin/env bun
/**
 * recall-watcher — リアルタイム想起ウォッチャー
 *
 * ccconv talk --watch の出力をパイプで受け取り、
 * ユーザー発言からキーワードを抽出して memory MCP に recall をかけ、
 * 結果を tmp/recall_buffer.jsonl に書き出す。
 *
 * 使い方:
 *   ccconv talk --watch --session=xxx | bun scripts/recall-watcher.ts
 *
 * オプション:
 *   --dry-run        recall を実行せず、クエリだけ表示
 *   --buffer=<path>  バッファファイルのパスを変更
 */

import { parseArgs } from "util";
import { resolve } from "path";

// --- CLI オプション ---
const { values: opts } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
    buffer: { type: "string" },
  },
  strict: false,
});

const isDryRun = opts["dry-run"] as boolean;

// SCRIPT_DIR ベースの相対パスでデフォルトバッファを解決
const SCRIPT_DIR = import.meta.dir;
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const bufferPath =
  (opts["buffer"] as string | undefined) ??
  resolve(PROJECT_ROOT, "tmp/recall_buffer.jsonl");

const CWD = PROJECT_ROOT;

// --- 状態 ---
type Role = "User" | "Assistant";

interface ConversationEntry {
  role: Role;
  lines: string[];
}

const history: ConversationEntry[] = [];
let currentEntry: ConversationEntry | null = null;

// デバウンス / ロック
let recallInProgress = false;
let pendingQuery: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// --- ヘッダー行のパース ---
// [2026-03-17 14:32:05] User:
// [2026-03-17 14:32:10] Assistant:
const HEADER_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s+(User|Assistant):\s*$/;

function extractRole(line: string): Role | null {
  const m = line.match(HEADER_RE);
  if (!m) return null;
  return m[1] as Role;
}

// --- recall 実行 ---
interface RecallEntry {
  axis: string;
  query: string;
  results: string;
  timestamp: string;
}

async function runRecall(query: string): Promise<void> {
  if (isDryRun) {
    console.error(`[recall-watcher] dry-run — query: ${query}`);
    return;
  }

  const axes = [
    { axis: "technical", label: "技術的な記憶" },
    { axis: "emotional", label: "感情的な記憶" },
    { axis: "causal", label: "因果的な記憶" },
  ];

  const timestamp = new Date().toISOString();

  const tasks = axes.map(async ({ axis, label }) => {
    const prompt = `mcp__memory__recall ツールを使って以下の文脈に関連する${label}を3件検索してください: ${query}`;

    try {
      const proc = Bun.spawn(
        [
          "claude",
          "-p",
          prompt,
          "--allowedTools",
          "mcp__memory__recall",
          "--cwd",
          CWD,
        ],
        {
          cwd: CWD,
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      const [stdout, _stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;

      const entry: RecallEntry = {
        axis,
        query,
        results: stdout.trim(),
        timestamp,
      };
      return entry;
    } catch (err) {
      // エラーが出ても無視して続行
      console.error(`[recall-watcher] recall error (${axis}):`, err);
      return null;
    }
  });

  const results = await Promise.all(tasks);
  const valid = results.filter((r): r is RecallEntry => r !== null);

  if (valid.length === 0) return;

  // 上書きモードで書き出し
  const lines = valid.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await Bun.write(bufferPath, lines);
  console.error(`[recall-watcher] wrote ${valid.length} entries to ${bufferPath}`);
}

// --- デバウンス付きrecall発火 ---
function scheduleRecall(query: string): void {
  if (recallInProgress) {
    // 進行中なら最新クエリを pending に保持（上書き）
    pendingQuery = query;
    return;
  }

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    recallInProgress = true;
    try {
      await runRecall(query);
    } finally {
      recallInProgress = false;
      // pending があれば次のrecallを発火
      if (pendingQuery !== null) {
        const next = pendingQuery;
        pendingQuery = null;
        scheduleRecall(next);
      }
    }
  }, 500);
}

// --- クエリ構築: 直近ユーザーメッセージを使う ---
function buildQuery(): string | null {
  // 末尾から遡ってUserエントリを探す
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.role === "User" && entry.lines.length > 0) {
      return entry.lines.join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
    }
  }
  return null;
}

// --- stdin 読み取り ---
async function readStdin(): Promise<void> {
  const decoder = new TextDecoder();
  const reader = Bun.stdin.stream().getReader();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 最後の要素は不完全な行かもしれないので保持
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      processLine(rawLine);
    }
  }

  // 残りのバッファを処理
  if (buffer.length > 0) {
    processLine(buffer);
  }
}

function processLine(line: string): void {
  const role = extractRole(line);

  if (role !== null) {
    // 前のエントリを履歴に保存
    if (currentEntry !== null) {
      // 末尾の空行を除去
      while (
        currentEntry.lines.length > 0 &&
        currentEntry.lines[currentEntry.lines.length - 1].trim() === ""
      ) {
        currentEntry.lines.pop();
      }
      history.push(currentEntry);
      // 履歴は直近10件に絞る（メモリ節約）
      if (history.length > 10) history.shift();
    }

    currentEntry = { role, lines: [] };

    // User の発言が始まったらrecallをスケジュール（前のAssistant応答を含む文脈で）
    if (role === "User") {
      // ヘッダーを見た時点でスケジュール（次行以降の本文を待たずに最後のUserクエリを使う）
      // 本文が溜まってから発火したほうが精度が高いため、
      // 実際の発火はAssistantヘッダー検出時（Userが喋り終えた後）に行う
    }

    if (role === "Assistant") {
      // Userの発言が終わってAssistantが応答し始めたタイミングでrecall発火
      const query = buildQuery();
      if (query) {
        scheduleRecall(query);
      }
    }
  } else if (currentEntry !== null) {
    // 本文を蓄積
    currentEntry.lines.push(line);
  }
}

// --- エントリポイント ---
console.error(`[recall-watcher] started. buffer=${bufferPath} dry-run=${isDryRun}`);

readStdin().catch((err) => {
  console.error("[recall-watcher] fatal:", err);
  process.exit(1);
});
