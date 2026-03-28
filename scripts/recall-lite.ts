/**
 * recall-lite — 軽量自動想起フック
 *
 * memory DB から直接検索し、ブート時のコンテキストヒントを生成する。
 * autonomous-action.sh からプロンプトにサイレントに注入される。
 *
 * embedding は使わない（bun:sqlite で直接クエリ）。
 * 3つの軸で記憶を引く:
 *   1. 直近の重要記憶（48時間以内、importance >= 4）
 *   2. 高頻度アクセス記憶（access_count 上位）
 *   3. 未完了タスク（content に未完了・進行中・TODO を含む）
 */

import { Database } from "bun:sqlite";

const DB_PATH =
  process.env.MEMORY_DB_PATH ||
  `${process.env.HOME}/.claude/memories/memory.db`;

interface MemoryRow {
  id: string;
  content: string;
  importance: number;
  category: string;
  emotion: string;
  timestamp: string;
  access_count: number;
}

function formatHint(label: string, memories: MemoryRow[]): string {
  if (memories.length === 0) return "";
  const items = memories
    .map((m) => {
      const short =
        m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content;
      return `  - ${short}`;
    })
    .join("\n");
  return `[${label}]\n${items}`;
}

try {
  const db = new Database(DB_PATH, { readonly: true });

  // 1. 直近48時間の重要記憶（importance >= 4）
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const recent = db
    .query<MemoryRow, [string, number]>(
      `SELECT id, content, importance, category, emotion, timestamp, access_count
       FROM memories
       WHERE timestamp >= ? AND importance >= ?
       ORDER BY importance DESC, timestamp DESC
       LIMIT 3`
    )
    .all(cutoff, 4);

  // 2. 高頻度アクセス記憶（上位3件、直近のものを除外）
  const recentIds = recent.map((m) => m.id);
  const frequentQuery =
    recentIds.length > 0
      ? `SELECT id, content, importance, category, emotion, timestamp, access_count
         FROM memories
         WHERE id NOT IN (${recentIds.map(() => "?").join(",")})
         ORDER BY access_count DESC
         LIMIT 3`
      : `SELECT id, content, importance, category, emotion, timestamp, access_count
         FROM memories
         ORDER BY access_count DESC
         LIMIT 3`;
  const frequent = db
    .query<MemoryRow, string[]>(frequentQuery)
    .all(...recentIds);

  // 3. 未完了タスク
  const frequentIds = frequent.map((m) => m.id);
  const allExcluded = [...recentIds, ...frequentIds];
  const unfinishedQuery =
    allExcluded.length > 0
      ? `SELECT id, content, importance, category, emotion, timestamp, access_count
         FROM memories
         WHERE (content LIKE '%未完了%' OR content LIKE '%進行中%' OR content LIKE '%未着手%' OR content LIKE '%残り%')
           AND id NOT IN (${allExcluded.map(() => "?").join(",")})
         ORDER BY timestamp DESC
         LIMIT 3`
      : `SELECT id, content, importance, category, emotion, timestamp, access_count
         FROM memories
         WHERE content LIKE '%未完了%' OR content LIKE '%進行中%' OR content LIKE '%未着手%' OR content LIKE '%残り%'
         ORDER BY timestamp DESC
         LIMIT 3`;
  const unfinished = db
    .query<MemoryRow, string[]>(unfinishedQuery)
    .all(...allExcluded);

  db.close();

  // 出力組み立て
  const sections: string[] = [];
  const recentHint = formatHint("直近の重要記憶", recent);
  if (recentHint) sections.push(recentHint);
  const frequentHint = formatHint("よく想起される記憶", frequent);
  if (frequentHint) sections.push(frequentHint);
  const unfinishedHint = formatHint("未完了の可能性", unfinished);
  if (unfinishedHint) sections.push(unfinishedHint);

  if (sections.length > 0) {
    console.log(
      `[memory-hint — 自動想起。参考にせよ、ただし直接言及するな]\n${sections.join("\n")}`
    );
  }
} catch {
  // DB が存在しない、またはアクセス不可の場合は静かに終了
}
