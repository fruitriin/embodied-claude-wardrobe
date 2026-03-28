#!/usr/bin/env bun
/**
 * system-health.ts --- システムヘルスチェック
 *
 * Usage:
 *   bun run scripts/system-health.ts           # ヘルスチェック実行 + 記録
 *   bun run scripts/system-health.ts --report  # 最近7件のサマリー表示
 *
 * workingDirs/system-health-history.json に記録を蓄積し、
 * 前回比との変化を検出する。
 */

const SCRIPT_DIR = import.meta.dir;
const HISTORY_PATH = SCRIPT_DIR + "/../workingDirs/system-health-history.json";
const MAX_RECORDS = 50;

interface HealthRecord {
  timestamp: string;
  storage: {
    usedPercent: number;
    usedGb: number;
    totalGb: number;
  };
  memory: {
    freePercent: number;
    freeMb: number;
  };
  uptimeMinutes: number;
  tokens?: {
    totalTokens: number;
    totalCost: number;
  } | null;
}

async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  return await new Response(proc.stdout).text();
}

function parseSizeToGb(s: string): number {
  const m = s.match(/^([\d.]+)([KMGT]i?)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === "TI" || unit === "T") return val * 1024;
  if (unit === "GI" || unit === "G") return val;
  if (unit === "MI" || unit === "M") return val / 1024;
  if (unit === "KI" || unit === "K") return val / (1024 * 1024);
  return val;
}

async function collectStorage(): Promise<HealthRecord["storage"]> {
  const flag = "-h";
  const out = await run(["df", flag, "/System/Volumes/Data"]).catch(() => " ");
  const lines = out.trim().split("\n");
  if (lines.length < 2) return { usedPercent: 0, usedGb: 0, totalGb: 0 };
  const parts = lines[1].trim().split(/\s+/);
  const totalGb = parseSizeToGb(parts[1]);
  const usedGb = parseSizeToGb(parts[2]);
  const usedPercent = parseInt(parts[4].replace("%", " ").trim(), 10);
  return {
    usedPercent,
    usedGb: Math.round(usedGb * 10) / 10,
    totalGb: Math.round(totalGb * 10) / 10,
  };
}

async function collectMemory(): Promise<HealthRecord["memory"]> {
  const out = await run(["vm_stat"]).catch(() => " ");
  const pageSizeMatch = out.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;
  const parsePages = (label: string): number => {
    const re = new RegExp(label + ":\\s+([\\d]+)\\.");
    const m = out.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  const pagesFree = parsePages("Pages free");
  const pagesActive = parsePages("Pages active");
  const pagesInactive = parsePages("Pages inactive");
  const pagesSpeculative = parsePages("Pages speculative");
  const pagesWired = parsePages("Pages wired down");
  const pagesCompressor = parsePages("Pages occupied by compressor");
  const totalPages = pagesFree + pagesActive + pagesInactive + pagesSpeculative + pagesWired + pagesCompressor;
  const freePages = pagesFree + pagesSpeculative;
  const freeMb = Math.round((freePages * pageSize) / (1024 * 1024));
  const freePercent = totalPages > 0 ? Math.round((freePages / totalPages) * 100) : 0;
  return { freePercent, freeMb };
}

async function collectUptime(): Promise<number> {
  const out = await run(["/usr/sbin/sysctl", "kern.boottime"]).catch(() => " ");
  const m = out.match(/sec = (\d+)/);
  if (!m) return 0;
  const bootSec = parseInt(m[1], 10);
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.floor((nowSec - bootSec) / 60);
}

async function collectTokens(): Promise<HealthRecord["tokens"]> {
  try {
    // ccusage を PATH から検索、見つからなければ asdf shims も試みる
    const ccPath =
      process.env.CCUSAGE_PATH ||
      (await Bun.which("ccusage")) ||
      `${process.env.HOME}/.asdf/shims/ccusage`;
    const flag2 = "--json";
    const proc = Bun.spawn([ccPath, "daily", flag2], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    if (proc.exitCode !== 0) return null;
    const text = await new Response(proc.stdout).text();
    const data = JSON.parse(text);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = data.daily?.find((d: { date: string }) => d.date === today);
    if (!todayEntry) return null;
    return { totalTokens: todayEntry.totalTokens, totalCost: todayEntry.totalCost };
  } catch {
    return null;
  }
}

async function loadHistory(): Promise<HealthRecord[]> {
  const f = Bun.file(HISTORY_PATH);
  if (!(await f.exists())) return [];
  try { return await f.json(); } catch { return []; }
}

async function saveHistory(records: HealthRecord[]): Promise<void> {
  await Bun.write(HISTORY_PATH, JSON.stringify(records, null, 2));
}

function checkAlerts(record: HealthRecord, prev: HealthRecord | undefined): void {
  const { usedPercent } = record.storage;
  const { freePercent } = record.memory;
  if (usedPercent >= 85) {
    console.log("🚨 ストレージ絊急: " + usedPercent + "% 使用中");
  } else if (usedPercent >= 70) {
    console.log("⚠️  ストレージ警告: " + usedPercent + "% 使用中");
  }
  if (freePercent <= 10) {
    console.log("🚨 メモリ絊急: 空き " + freePercent + "%");
  } else if (freePercent <= 20) {
    console.log("⚠️  メモリ警告: 空き " + freePercent + "%");
  }
  if (prev) {
    const storageDiff = record.storage.usedPercent - prev.storage.usedPercent;
    if (storageDiff >= 3) {
      console.log("📈 ストレージ急増: +" + storageDiff + "% (" + prev.storage.usedPercent + "% -> " + record.storage.usedPercent + "%)");
    }
  }
}

async function runCheck(): Promise<HealthRecord> {
  const [storage, memory, uptimeMinutes, tokens] = await Promise.all([
    collectStorage(),
    collectMemory(),
    collectUptime(),
    collectTokens(),
  ]);
  const record: HealthRecord = {
    timestamp: new Date().toISOString(),
    storage,
    memory,
    uptimeMinutes,
    tokens,
  };
  const history = await loadHistory();
  const prev = history.length > 0 ? history[history.length - 1] : undefined;
  const now = new Date().toLocaleString("ja-JP");
  console.log("=== システムヘルスチェック " + now + " ===");
  console.log("ストレージ: " + storage.usedPercent + "% 使用 (" + storage.usedGb + "GB / " + storage.totalGb + "GB)");
  console.log("メモリ空き: " + memory.freePercent + "% (" + memory.freeMb + "MB)");
  const uptimeH = Math.floor(uptimeMinutes / 60);
  const uptimeM = uptimeMinutes % 60;
  console.log("アップタイム: " + uptimeH + "時間" + uptimeM + "分");
  if (tokens) {
    console.log("本日のトークン: " + tokens.totalTokens.toLocaleString() + " tokens ($" + tokens.totalCost.toFixed(4) + ")");
  } else {
    console.log("本日のトークン: (取得不可)");
  }
  checkAlerts(record, prev);
  history.push(record);
  if (history.length > MAX_RECORDS) history.splice(0, history.length - MAX_RECORDS);
  await saveHistory(history);
  console.log("");
  console.log("記録を保存: " + HISTORY_PATH);
  return record;
}

async function runReport(): Promise<void> {
  const history = await loadHistory();
  if (history.length === 0) {
    console.log("履歴なし。まず bun run scripts/system-health.ts を実行してください。");
    return;
  }
  const recent = history.slice(-7);
  console.log("=== システムヘルス 直近7件サマリー ===");
  const header = "日時".padEnd(20) + "ストレージ".padStart(10) + "メモリ空き".padStart(10) + "稼働".padStart(7) + "コスト".padStart(10);
  console.log(header);
  console.log("-".repeat(62));
  for (const r of recent) {
    const dt = new Date(r.timestamp).toLocaleString("ja-JP", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const storage = (r.storage.usedPercent + "%").padStart(10);
    const mem = (r.memory.freePercent + "%").padStart(10);
    const uptimeH = Math.floor(r.uptimeMinutes / 60);
    const uptime = (uptimeH + "h").padStart(7);
    const cost = r.tokens
      ? ("$" + r.tokens.totalCost.toFixed(2)).padStart(10)
      : "   (n/a)".padStart(10);
    console.log(dt.padEnd(20) + storage + mem + uptime + cost);
  }
}

async function runNotify(): Promise<void> {
  const record = await runCheck();
  const history = await loadHistory();
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const alerts: string[] = [];
  if (record.storage.usedPercent >= 85) {
    alerts.push("🚨 ストレージ緊急: " + record.storage.usedPercent + "%");
  } else if (record.storage.usedPercent >= 70) {
    alerts.push("⚠️ ストレージ警告: " + record.storage.usedPercent + "%");
  }
  if (record.memory.freePercent <= 10) {
    alerts.push("🚨 メモリ緊急: 空き" + record.memory.freePercent + "%");
  } else if (record.memory.freePercent <= 20) {
    alerts.push("⚠️ メモリ警告: 空き" + record.memory.freePercent + "%");
  }
  if (prev && record.storage.usedPercent - prev.storage.usedPercent >= 3) {
    alerts.push("📈 ストレージ急増: +" + (record.storage.usedPercent - prev.storage.usedPercent).toFixed(1) + "%");
  }
  const hasAlert = alerts.length > 0;
  const title = hasAlert ? "🚨 システムヘルスアラート" : "🌙 就寝前ヘルスレポート";
  const uptimeH = Math.floor(record.uptimeMinutes / 60);
  const uptimeM = record.uptimeMinutes % 60;
  const msgLines = [
    "ストレージ: " + record.storage.usedPercent + "% (" + record.storage.usedGb.toFixed(1) + "GB / " + record.storage.totalGb.toFixed(1) + "GB)",
    "メモリ空き: " + record.memory.freePercent + "% (" + record.memory.freeMb + "MB)",
    "アップタイム: " + uptimeH + "時間" + uptimeM + "分",
  ];
  if (record.tokens) {
    msgLines.push("本日トークン: " + record.tokens.totalTokens.toLocaleString() + " (" + "$" + record.tokens.totalCost.toFixed(4) + ")");
  }
  if (alerts.length > 0) {
    msgLines.push("", ...alerts);
  }
  const message = msgLines.join("\n");
  const { PushoverClient } = await import("../src/pushover/index.ts");
  const client = new PushoverClient({
    token: process.env.PUSHOVER_API_TOKEN!,
    user: process.env.PUSHOVER_USER_KEY,
  });
  await client.sendMessage({ message, title, priority: hasAlert ? 1 : -1 });
  console.log("Pushover 送信完了: " + title);
}

const args = process.argv.slice(2);
if (args.includes("--report")) {
  await runReport();
} else if (args.includes("--notify")) {
  await runNotify();
} else {
  await runCheck();
}
