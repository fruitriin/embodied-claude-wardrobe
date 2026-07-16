import { spreadAssociations, adaptiveSearchParams, type AssociationDiagnostics } from "./association";
import { sql, toTextArrayLiteral } from "./db";
import { embedPassage, embedQuery, toVectorLiteral } from "./embedding";
import { rowToEpisode, rowToMemory, rowToMemoryLink } from "./mapping";
import {
  calculateContextRelevance,
  calculateEmotionBoost,
  calculateNoveltyScore,
  calculatePredictionError,
} from "./predictive";
import type {
  Episode,
  LinkType,
  Memory,
  MemoryLink,
  MemorySearchResult,
  RememberOptions,
} from "./types";
import { calculateBoundaryScore, diversityScore, selectWorkspaceCandidates, type WorkspaceCandidate } from "./workspace";

// ── remember ─────────────────────────────────────────────
export async function remember(content: string, opts: RememberOptions = {}): Promise<Memory> {
  const embedding = await embedPassage(content);
  const vecLiteral = toVectorLiteral(embedding);
  const tagsLiteral = toTextArrayLiteral(opts.tags ?? []);

  const [row] = await sql`
    INSERT INTO memories (content, emotion, importance, category, evidence_type, tags, flash_keywords)
    VALUES (
      ${content},
      ${opts.emotion ?? "neutral"},
      ${opts.importance ?? 3},
      ${opts.category ?? "daily"},
      ${opts.evidenceType ?? null},
      ${tagsLiteral}::text[],
      ${opts.flashKeywords ?? null}
    )
    RETURNING *
  `;

  await sql`INSERT INTO embeddings (memory_id, embedding) VALUES (${row.id}, ${vecLiteral}::vector)`;

  const memory = rowToMemory(row);

  if (opts.autoLink ?? true) {
    await autoLinkSimilar(memory.id, vecLiteral, opts.linkThreshold ?? 0.2);
  }

  return memory;
}

// 埋め込み類似度に基づく自動リンク（旧SQLite版 save_with_auto_link 相当）。
// pgvector の distance は cosine distance (0=完全一致, 2=正反対)。閾値は距離なので小さいほど厳しい
async function autoLinkSimilar(memoryId: string, vecLiteral: string, distanceThreshold: number, maxLinks = 5): Promise<void> {
  const candidates = await sql`
    SELECT m.id, e.embedding <=> ${vecLiteral}::vector AS distance
    FROM embeddings e JOIN memories m ON m.id = e.memory_id
    WHERE m.id != ${memoryId} AND e.embedding <=> ${vecLiteral}::vector <= ${distanceThreshold}
    ORDER BY distance
    LIMIT ${maxLinks}
  `;
  for (const c of candidates) {
    await sql`
      INSERT INTO memory_links (source_id, target_id, link_type)
      VALUES (${memoryId}, ${c.id}, 'similar_auto')
      ON CONFLICT (source_id, target_id, link_type) DO NOTHING
    `;
    await sql`
      INSERT INTO memory_links (source_id, target_id, link_type)
      VALUES (${c.id}, ${memoryId}, 'similar_auto')
      ON CONFLICT (source_id, target_id, link_type) DO NOTHING
    `;
  }
}

// ── recall / search_memories ────────────────────────────
export async function recall(context: string, nResults = 5): Promise<MemorySearchResult[]> {
  const vecLiteral = toVectorLiteral(await embedQuery(context));
  const rows = await sql`
    SELECT m.*, e.embedding <=> ${vecLiteral}::vector AS distance
    FROM embeddings e JOIN memories m ON m.id = e.memory_id
    ORDER BY distance
    LIMIT ${nResults}
  `;
  return rows.map((r: Record<string, unknown>) => ({
    memory: rowToMemory(r),
    distance: Number(r.distance),
  }));
}

export async function getMemoriesByIds(ids: string[]): Promise<Memory[]> {
  if (ids.length === 0) return [];
  const rows = await sql`SELECT * FROM memories WHERE id = ANY(${toTextArrayLiteral(ids)}::uuid[])`;
  return rows.map(rowToMemory);
}

export interface SearchMemoriesFilter {
  emotion?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function searchMemories(
  query: string,
  nResults = 5,
  filter: SearchMemoriesFilter = {}
): Promise<MemorySearchResult[]> {
  const vecLiteral = toVectorLiteral(await embedQuery(query));
  const rows = await sql`
    SELECT m.*, e.embedding <=> ${vecLiteral}::vector AS distance
    FROM embeddings e JOIN memories m ON m.id = e.memory_id
    WHERE (${filter.emotion ?? null}::text IS NULL OR m.emotion = ${filter.emotion ?? null})
      AND (${filter.category ?? null}::text IS NULL OR m.category = ${filter.category ?? null})
      AND (${filter.dateFrom ?? null}::timestamptz IS NULL OR m.timestamp >= ${filter.dateFrom ?? null}::timestamptz)
      AND (${filter.dateTo ?? null}::timestamptz IS NULL OR m.timestamp <= ${filter.dateTo ?? null}::timestamptz)
    ORDER BY distance
    LIMIT ${nResults}
  `;
  return rows.map((r: Record<string, unknown>) => ({
    memory: rowToMemory(r),
    distance: Number(r.distance),
  }));
}

// ── list_recent_memories ────────────────────────────────
export async function listRecentMemories(limit = 10, categoryFilter?: string): Promise<Memory[]> {
  const rows = await sql`
    SELECT * FROM memories
    WHERE (${categoryFilter ?? null}::text IS NULL OR category = ${categoryFilter ?? null})
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToMemory);
}

// ── get_memory_stats ─────────────────────────────────────
export interface MemoryStats {
  totalCount: number;
  byCategory: Record<string, number>;
  byEmotion: Record<string, number>;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
}

export async function getMemoryStats(): Promise<MemoryStats> {
  const [totalRow] = await sql`SELECT count(*)::int AS count FROM memories`;
  const byCategoryRows = await sql`SELECT category, count(*)::int AS count FROM memories GROUP BY category`;
  const byEmotionRows = await sql`SELECT emotion, count(*)::int AS count FROM memories GROUP BY emotion`;
  const [rangeRow] = await sql`SELECT min(timestamp) AS oldest, max(timestamp) AS newest FROM memories`;

  const byCategory: Record<string, number> = {};
  for (const r of byCategoryRows) byCategory[r.category as string] = r.count as number;
  const byEmotion: Record<string, number> = {};
  for (const r of byEmotionRows) byEmotion[r.emotion as string] = r.count as number;

  return {
    totalCount: totalRow.count as number,
    byCategory,
    byEmotion,
    oldestTimestamp: rangeRow.oldest ? new Date(rangeRow.oldest as string).toISOString() : null,
    newestTimestamp: rangeRow.newest ? new Date(rangeRow.newest as string).toISOString() : null,
  };
}

// ── link_memories / get_causal_chain（memory_links 統合edgeテーブル） ──
export async function linkMemories(
  sourceId: string,
  targetId: string,
  linkType: LinkType = "caused_by",
  note?: string
): Promise<MemoryLink> {
  const [row] = await sql`
    INSERT INTO memory_links (source_id, target_id, link_type, note)
    VALUES (${sourceId}, ${targetId}, ${linkType}, ${note ?? null})
    ON CONFLICT (source_id, target_id, link_type) DO UPDATE SET note = EXCLUDED.note
    RETURNING *
  `;
  return rowToMemoryLink(row);
}

export interface CausalChainEntry {
  memory: Memory;
  linkType: LinkType;
}

// direction: 'backward' は caused_by を遡る、'forward' は leads_to を辿る。
// linkTypes を省略すると全 link_type を辿る（旧 get_memory_chain 相当、Postgres移植で統合）
export async function getCausalChain(
  memoryId: string,
  direction: "backward" | "forward" | "any" = "backward",
  maxDepth = 5
): Promise<CausalChainEntry[]> {
  const linkTypes: LinkType[] =
    direction === "backward" ? ["caused_by"] : direction === "forward" ? ["leads_to"] : [];

  const visited = new Set<string>([memoryId]);
  let currentIds = [memoryId];
  const result: CausalChainEntry[] = [];

  for (let depth = 0; depth < maxDepth && currentIds.length > 0; depth++) {
    const nextIds: string[] = [];
    for (const id of currentIds) {
      const rows =
        linkTypes.length > 0
          ? await sql`SELECT * FROM memory_links WHERE source_id = ${id} AND link_type = ANY(${toTextArrayLiteral(linkTypes)}::text[])`
          : await sql`SELECT * FROM memory_links WHERE source_id = ${id}`;

      for (const linkRow of rows) {
        const targetId = linkRow.target_id as string;
        if (visited.has(targetId)) continue;
        visited.add(targetId);
        const [memRow] = await sql`SELECT * FROM memories WHERE id = ${targetId}`;
        if (!memRow) continue;
        result.push({ memory: rowToMemory(memRow), linkType: linkRow.link_type as LinkType });
        nextIds.push(targetId);
      }
    }
    currentIds = nextIds;
  }

  return result;
}

// ── create_episode ───────────────────────────────────────
export async function createEpisode(
  title: string,
  memoryIds: string[],
  opts: { participants?: string[]; summary?: string } = {}
): Promise<Episode> {
  const memories = await sql`SELECT * FROM memories WHERE id = ANY(${toTextArrayLiteral(memoryIds)}::uuid[]) ORDER BY timestamp`;
  if (memories.length === 0) {
    throw new Error("No matching memories found for episode");
  }

  const timestamps = memories.map((m: Record<string, unknown>) => new Date(m.timestamp as string).getTime());
  const startTime = new Date(Math.min(...timestamps)).toISOString();
  const endTime = new Date(Math.max(...timestamps)).toISOString();
  const emotions = memories.map((m: Record<string, unknown>) => m.emotion as string);
  const dominantEmotion = mostFrequent(emotions) ?? "neutral";
  const importance = Math.round(
    memories.reduce((sum: number, m: Record<string, unknown>) => sum + (m.importance as number), 0) / memories.length
  );

  const participantsLiteral = toTextArrayLiteral(opts.participants ?? []);
  const [episodeRow] = await sql`
    INSERT INTO episodes (title, start_time, end_time, participants, summary, emotion, importance)
    VALUES (${title}, ${startTime}, ${endTime}, ${participantsLiteral}::text[], ${opts.summary ?? ""}, ${dominantEmotion}, ${importance})
    RETURNING *
  `;

  for (let i = 0; i < memories.length; i++) {
    await sql`
      INSERT INTO episode_memories (episode_id, memory_id, order_index)
      VALUES (${episodeRow.id}, ${memories[i].id}, ${i})
    `;
  }

  return rowToEpisode(episodeRow);
}

function mostFrequent(items: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

// ── recall_with_associations ─────────────────────────────
// recall の結果 + 各結果の memory_links を chainDepth 段階まで辿った関連記憶（旧 recall_with_chain 相当）。
// 旧SQLite版は linked_ids（無向）のみ辿っていたが、Postgres版は memory_links 統合テーブルを
// link_typeフィルタなし（"any"方向）で辿る（旧get_memory_chain相当、Phase1設計判断通り）
export async function recallWithAssociations(
  context: string,
  nResults = 3,
  chainDepth = 1
): Promise<MemorySearchResult[]> {
  const mainResults = await recall(context, nResults);
  const seenIds = new Set(mainResults.map((r) => r.memory.id));
  const linkedResults: MemorySearchResult[] = [];

  for (const result of mainResults) {
    const chain = await getCausalChain(result.memory.id, "any", chainDepth);
    for (const entry of chain) {
      if (!seenIds.has(entry.memory.id)) {
        seenIds.add(entry.memory.id);
        linkedResults.push({ memory: entry.memory, distance: 999.0 });
      }
    }
  }

  return [...mainResults, ...linkedResults];
}

// ── save_visual_memory / recall_by_camera_position ──────
export interface CameraPosition {
  panAngle: number;
  tiltAngle: number;
  presetId?: string;
}

export async function saveVisualMemory(
  content: string,
  imagePath: string,
  cameraPosition: CameraPosition,
  opts: { emotion?: string; importance?: number } = {}
): Promise<Memory> {
  const embedding = await embedPassage(content);
  const vecLiteral = toVectorLiteral(embedding);
  // bun:sql は JS オブジェクトをそのまま渡すと自動で jsonb にシリアライズする。
  // JSON.stringify() してから ::jsonb キャストすると二重エンコードされる罠を踏んだ
  // （camera_position が文字列 "\"{...}\"" になってしまい ->>'pan_angle' が抽出できなくなる）
  const cameraPositionObj = {
    pan_angle: cameraPosition.panAngle,
    tilt_angle: cameraPosition.tiltAngle,
    preset_id: cameraPosition.presetId ?? null,
  };
  const sensoryDataArr = [
    { sensory_type: "visual", file_path: imagePath, metadata: {}, description: null, timestamp: new Date().toISOString() },
  ];

  const [row] = await sql`
    INSERT INTO memories (content, emotion, importance, category, camera_position, sensory_data)
    VALUES (
      ${content},
      ${opts.emotion ?? "neutral"},
      ${opts.importance ?? 3},
      'observation',
      ${cameraPositionObj},
      ${sensoryDataArr}
    )
    RETURNING *
  `;
  await sql`INSERT INTO embeddings (memory_id, embedding) VALUES (${row.id}, ${vecLiteral}::vector)`;
  return rowToMemory(row);
}

export async function recallByCameraPosition(
  panAngle: number,
  tiltAngle: number,
  tolerance = 15
): Promise<Memory[]> {
  const rows = await sql`
    SELECT * FROM memories
    WHERE camera_position IS NOT NULL
      AND abs((camera_position->>'pan_angle')::numeric - ${panAngle}) <= ${tolerance}
      AND abs((camera_position->>'tilt_angle')::numeric - ${tiltAngle}) <= ${tolerance}
    ORDER BY timestamp DESC
  `;
  return rows.map(rowToMemory);
}

// ── search_important_memories（working memory の refresh 用） ──
export async function searchImportantMemories(
  minImportance = 4,
  minAccessCount = 5,
  since?: string,
  nResults = 10
): Promise<Memory[]> {
  const rows = await sql`
    SELECT * FROM memories
    WHERE importance >= ${minImportance}
      AND access_count >= ${minAccessCount}
      AND (${since ?? null}::timestamptz IS NULL OR last_accessed >= ${since ?? null}::timestamptz)
    ORDER BY importance DESC, access_count DESC
    LIMIT ${nResults}
  `;
  return rows.map(rowToMemory);
}

// ── consolidate_memories（旧Python版のPhase1「基本リプレイ」+ Phase2「freshness減衰」+
// Phase6「importance drift」のみ移植。合成記憶生成・boundary_layers・overlap検出・
// orphan救済・intersection検出・daily_digest生成は composite_* 等の専用テーブルが
// Phase1スキーマのスコープ外（remote-memory-mcp.md「スコープ外」節）のため、
// テーブル追加とセットで別途判断する ──

// 直近の記憶をペアで辿り、共活性化(coactivation)を強化しつつ、活性化回数と
// 予測誤差を更新する。閾値を超えたペアには自動でrelatedリンクを張る
async function bumpCoactivation(sourceId: string, targetId: string, delta = 0.1): Promise<void> {
  const clampedDelta = Math.max(0, Math.min(1, delta));
  for (const [s, t] of [
    [sourceId, targetId],
    [targetId, sourceId],
  ] as const) {
    await sql`
      INSERT INTO coactivation (source_id, target_id, weight)
      VALUES (${s}, ${t}, ${clampedDelta})
      ON CONFLICT (source_id, target_id)
      DO UPDATE SET weight = LEAST(1.0, GREATEST(0.0, coactivation.weight + ${clampedDelta}))
    `;
  }
}

async function recordActivation(memoryId: string, predictionError?: number): Promise<void> {
  const clamped = predictionError === undefined ? null : Math.max(0, Math.min(1, predictionError));
  await sql`
    UPDATE memories
    SET activation_count = activation_count + 1,
        last_activated = now(),
        prediction_error = COALESCE(${clamped}::real, prediction_error)
    WHERE id = ${memoryId}
  `;
}

async function maybeAddRelatedLink(sourceId: string, targetId: string, threshold = 0.6): Promise<boolean> {
  const [row] = await sql`
    SELECT weight FROM coactivation WHERE source_id = ${sourceId} AND target_id = ${targetId}
  `;
  if (!row || Number(row.weight) < threshold) return false;
  await linkMemories(sourceId, targetId, "related", "auto-linked by consolidation replay");
  return true;
}

async function consolidateFreshness(factor = 0.92): Promise<void> {
  await sql`UPDATE memories SET freshness = GREATEST(0.01, freshness * ${factor})`;
}

async function driftImportance(): Promise<{ promoted: number; demoted: number }> {
  const all = await listRecentMemories(10000);
  let promoted = 0;
  let demoted = 0;

  for (const mem of all) {
    let newImportance = mem.importance;

    if (mem.activationCount >= 15 && mem.importance < 5) newImportance = mem.importance + 1;
    else if (mem.activationCount >= 5 && mem.importance < 4) newImportance = mem.importance + 1;
    else if (mem.accessCount >= 10 && mem.importance < 4) newImportance = mem.importance + 1;

    if (
      newImportance === mem.importance &&
      mem.freshness < 0.05 &&
      mem.accessCount === 0 &&
      mem.activationCount === 0 &&
      mem.importance > 1 &&
      mem.importance < 5 // importance 5 は降格保護
    ) {
      newImportance = mem.importance - 1;
    }

    if (newImportance !== mem.importance) {
      await sql`UPDATE memories SET importance = ${newImportance} WHERE id = ${mem.id}`;
      if (newImportance > mem.importance) promoted++;
      else demoted++;
    }
  }

  return { promoted, demoted };
}

export interface ConsolidationStats {
  replayEvents: number;
  coactivationUpdates: number;
  linkUpdates: number;
  refreshedMemories: number;
  freshnessDecayed: boolean;
  importancePromoted: number;
  importanceDemoted: number;
}

export async function consolidateMemories(
  windowHours = 24,
  maxReplayEvents = 200,
  linkUpdateStrength = 0.2
): Promise<ConsolidationStats> {
  // 旧Python版のmax(1, window_hours)を踏襲。0以下を渡すとcutoffが現在時刻以降になり
  // リプレイが常に0件でサイレントに無効化されるため下限を1時間にクランプする
  const cutoff = new Date(Date.now() - Math.max(1, windowHours) * 3600_000);
  const candidates = await listRecentMemories(Math.max(maxReplayEvents * 2, 50));
  const recent = candidates.filter((m) => new Date(m.timestamp) >= cutoff);

  let replayEvents = 0;
  let coactivationUpdates = 0;
  let linkUpdates = 0;
  const refreshedIds = new Set<string>();

  if (recent.length >= 2) {
    for (let idx = 0; idx < recent.length - 1 && replayEvents < maxReplayEvents; idx++) {
      const left = recent[idx]!;
      const right = recent[idx + 1]!;
      const delta = Math.max(0.05, Math.min(1.0, linkUpdateStrength));

      // ペア内の更新は互いに独立なので並列化してDB往復回数の影響を抑える
      // (wd-code-review指摘: 逐次awaitは件数が増えると往復回数がボトルネックになりうる)
      await Promise.all([
        bumpCoactivation(left.id, right.id, delta),
        recordActivation(left.id, Math.max(0, left.predictionError * 0.9)),
        recordActivation(right.id, Math.max(0, right.predictionError * 0.9)),
      ]);
      coactivationUpdates += 2;
      refreshedIds.add(left.id);
      refreshedIds.add(right.id);

      if (await maybeAddRelatedLink(left.id, right.id, 0.6)) linkUpdates++;

      replayEvents++;
    }
  }

  await consolidateFreshness();
  const drift = await driftImportance();

  return {
    replayEvents,
    coactivationUpdates,
    linkUpdates,
    refreshedMemories: refreshedIds.size,
    freshnessDecayed: true,
    importancePromoted: drift.promoted,
    importanceDemoted: drift.demoted,
  };
}

// ── recall_divergent ─────────────────────────────────────
// 旧Python版store.py:1432-の移植。意味検索でシードを取り、連想グラフを拡張し、
// グローバルワークスペース風の勝者総取り競合で多様な記憶を選び出す「拡散的想起」。
// calculateBoundaryScore用に、複数の記憶の発リンク型一覧をまとめて取得する
// (wd-code-review指摘: 候補ごとの逐次問い合わせはN+1になるため一括取得に変更)
async function getOutgoingLinkTypesBatch(memoryIds: string[]): Promise<Map<string, LinkType[]>> {
  if (memoryIds.length === 0) return new Map();
  const rows = await sql`
    SELECT source_id, link_type FROM memory_links WHERE source_id = ANY(${toTextArrayLiteral(memoryIds)}::uuid[])
  `;
  const result = new Map<string, LinkType[]>();
  for (const row of rows as Record<string, unknown>[]) {
    const sourceId = row.source_id as string;
    const linkType = row.link_type as LinkType;
    const list = result.get(sourceId);
    if (list) list.push(linkType);
    else result.set(sourceId, [linkType]);
  }
  return result;
}

export interface RecallDivergentOptions {
  nResults?: number;
  maxBranches?: number;
  maxDepth?: number;
  temperature?: number;
  includeDiagnostics?: boolean;
  recordActivation?: boolean;
}

export interface RecallDivergentDiagnostics {
  avgPredictionError: number;
  avgNovelty: number;
  diversity: number;
  branchesUsed: number;
  depthUsed: number;
  association: AssociationDiagnostics;
}

export async function recallDivergent(
  context: string,
  opts: RecallDivergentOptions = {}
): Promise<{ results: MemorySearchResult[]; diagnostics: RecallDivergentDiagnostics | Record<string, never> }> {
  const nResults = Math.max(1, Math.min(20, opts.nResults ?? 5));
  const seedSize = Math.max(3, Math.min(25, nResults * 3));
  const seeds = await recall(context, seedSize);
  if (seeds.length === 0) return { results: [], diagnostics: {} };

  const { branches: branchLimit, depth: depthLimit } = adaptiveSearchParams(
    context,
    opts.maxBranches ?? 3,
    opts.maxDepth ?? 3,
    seeds.length
  );

  const seedMemories = seeds.map((s) => s.memory);
  const { expanded, diagnostics: assocDiag } = await spreadAssociations(
    seedMemories,
    branchLimit,
    depthLimit,
    getMemoriesByIds
  );

  const distanceMap = new Map(seeds.map((s) => [s.memory.id, s.distance]));
  const allCandidates = new Map<string, Memory>();
  for (const m of [...seedMemories, ...expanded]) allCandidates.set(m.id, m);

  const linkTypesBySource = await getOutgoingLinkTypesBatch([...allCandidates.keys()]);

  const workspaceCandidates: WorkspaceCandidate[] = [];
  const predictionErrors: number[] = [];
  const noveltyScores: number[] = [];

  for (const memory of allCandidates.values()) {
    const semanticDistance = distanceMap.get(memory.id);
    const relevance =
      semanticDistance === undefined
        ? calculateContextRelevance(context, memory)
        : 1 / (1 + Math.max(0, semanticDistance));

    const predictionError = calculatePredictionError(context, memory);
    const novelty = calculateNoveltyScore(memory, predictionError);
    const emotionBoost = calculateEmotionBoost(memory.emotion);
    const normalizedEmotion = Math.max(0, Math.min(1, emotionBoost / 0.4));

    const linkTypes = linkTypesBySource.get(memory.id) ?? [];
    const boundary = calculateBoundaryScore(linkTypes, linkTypes.length);

    predictionErrors.push(predictionError);
    noveltyScores.push(novelty);
    workspaceCandidates.push({
      memory,
      relevance,
      novelty,
      predictionError,
      emotionBoost: normalizedEmotion,
      boundaryScore: boundary,
    });
  }

  const selected = selectWorkspaceCandidates(workspaceCandidates, nResults, opts.temperature ?? 0.7);

  const results: MemorySearchResult[] = [];
  const selectedMemories: Memory[] = [];
  const shouldRecordActivation = opts.recordActivation ?? true;

  for (const { candidate, score } of selected) {
    selectedMemories.push(candidate.memory);
    if (shouldRecordActivation) {
      await recordActivation(candidate.memory.id, candidate.predictionError);
      await sql`UPDATE memories SET novelty_score = ${candidate.novelty} WHERE id = ${candidate.memory.id}`;
    }
    const scoreDistance = Math.max(0, 1 - score);
    results.push({ memory: candidate.memory, distance: scoreDistance });
  }

  if (!(opts.includeDiagnostics ?? false)) return { results, diagnostics: {} };

  const avgPredictionError =
    predictionErrors.length > 0 ? predictionErrors.reduce((a, b) => a + b, 0) / predictionErrors.length : 0;
  const avgNovelty = noveltyScores.length > 0 ? noveltyScores.reduce((a, b) => a + b, 0) / noveltyScores.length : 0;

  return {
    results,
    diagnostics: {
      avgPredictionError,
      avgNovelty,
      diversity: diversityScore(selectedMemories),
      branchesUsed: branchLimit,
      depthUsed: depthLimit,
      association: assocDiag,
    },
  };
}
