import { sql, toTextArrayLiteral } from "./db";
import { queryAmbiguityScore } from "./predictive";
import type { Memory } from "./types";

// recall_divergentの連想的グラフ拡張。
// 旧wardrobe SQLite版(.claude/mcps/memory-mcp/src/memory_mcp/association.py)の移植。

export interface AssociationDiagnostics {
  branchesUsed: number;
  depthUsed: number;
  traversedEdges: number;
  expandedNodes: number;
  avgBranchingFactor: number;
}

// 複数の記憶から辿れる近傍記憶IDを、記憶ごとに重み降順で返す。旧Python版はSQLite版Memory
// に埋め込まれたlinked_ids/links/coactivation_weightsをメモリ上で結合していたが、
// Postgres版はmemory_links(発リンク、weight列を実値として保持)とcoactivationの2テーブル
// を問い合わせる形になる。spreadAssociationsの深さ1レベル分の全記憶IDをまとめて
// 1クエリで引く(wd-code-review指摘: 記憶ごとの逐次問い合わせはN+1になる)
async function getNeighborCandidatesBatch(memoryIds: string[]): Promise<Map<string, string[]>> {
  if (memoryIds.length === 0) return new Map();
  const idsLiteral = toTextArrayLiteral(memoryIds);
  const rows = await sql`
    SELECT source_id, target_id, weight FROM (
      SELECT source_id, target_id, weight FROM memory_links WHERE source_id = ANY(${idsLiteral}::uuid[])
      UNION ALL
      SELECT source_id, target_id, weight FROM coactivation WHERE source_id = ANY(${idsLiteral}::uuid[])
    ) combined
  `;

  const dedupBySource = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const sourceId = row.source_id as string;
    const targetId = row.target_id as string;
    const weight = Number(row.weight);
    let dedup = dedupBySource.get(sourceId);
    if (!dedup) {
      dedup = new Map();
      dedupBySource.set(sourceId, dedup);
    }
    if (!dedup.has(targetId) || dedup.get(targetId)! < weight) dedup.set(targetId, weight);
  }

  const result = new Map<string, string[]>();
  for (const [sourceId, dedup] of dedupBySource) {
    result.set(
      sourceId,
      [...dedup.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    );
  }
  return result;
}

export interface AssociationSpreadResult {
  expanded: Memory[];
  diagnostics: AssociationDiagnostics;
}

// シード記憶群からmaxDepth段階、各段max branches本まで近傍を辿って拡張する
// (旧AssociationEngine.spread相当)。近傍ID取得(getNeighborCandidatesBatch)・記憶本体の
// 取得(fetchMemoriesByIds)とも、深さ1レベル分の全IDをまとめて1クエリで引く(N+1回避)
export async function spreadAssociations(
  seeds: Memory[],
  maxBranches: number,
  maxDepth: number,
  fetchMemoriesByIds: (ids: string[]) => Promise<Memory[]>
): Promise<AssociationSpreadResult> {
  if (seeds.length === 0) {
    return {
      expanded: [],
      diagnostics: { branchesUsed: maxBranches, depthUsed: maxDepth, traversedEdges: 0, expandedNodes: 0, avgBranchingFactor: 0 },
    };
  }

  const visited = new Set(seeds.map((m) => m.id));
  let currentLevel = seeds;
  const expanded: Memory[] = [];
  let traversedEdges = 0;
  const branchingCounts: number[] = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentLevel.length === 0) break;

    const neighborsBySource = await getNeighborCandidatesBatch(currentLevel.map((m) => m.id));

    const frontierIds: string[] = [];
    for (const memory of currentLevel) {
      const neighbors = (neighborsBySource.get(memory.id) ?? []).slice(0, maxBranches);
      branchingCounts.push(neighbors.length);
      for (const neighborId of neighbors) {
        traversedEdges++;
        if (!visited.has(neighborId)) {
          frontierIds.push(neighborId);
          visited.add(neighborId);
        }
      }
    }

    if (frontierIds.length === 0) break;

    const fetched = await fetchMemoriesByIds(frontierIds);
    expanded.push(...fetched);
    currentLevel = fetched;
  }

  const avgBranchingFactor =
    branchingCounts.length > 0 ? branchingCounts.reduce((a, b) => a + b, 0) / branchingCounts.length : 0;

  return {
    expanded,
    diagnostics: {
      branchesUsed: maxBranches,
      depthUsed: maxDepth,
      traversedEdges,
      expandedNodes: expanded.length,
      avgBranchingFactor,
    },
  };
}

// クエリの曖昧さ・シード件数の少なさに応じてbranch/depthを調整する。
// 曖昧なクエリ(短い/繰り返しの多いクエリ)ほど広く・深く探索する
export function adaptiveSearchParams(
  context: string,
  requestedBranches: number,
  requestedDepth: number,
  seedCount: number
): { branches: number; depth: number } {
  let ambiguity = queryAmbiguityScore(context);
  if (seedCount <= 1) ambiguity = Math.min(1, ambiguity + 0.2);

  const branchScale = 0.8 + ambiguity;
  const depthScale = 0.9 + 0.5 * ambiguity;

  // 注意: PythonのroundはJIS丸め(偶数への丸め)、Math.roundは常に切り上げのため
  // ちょうど.5になる入力では1ずれうる(wd-code-review指摘)。branches/depthは
  // その後[1,8]/[1,5]にクランプされる整数のため実害は軽微と判断し許容している
  let branches = Math.round(requestedBranches * branchScale);
  let depth = Math.round(requestedDepth * depthScale);

  branches = Math.max(1, Math.min(8, branches));
  depth = Math.max(1, Math.min(5, depth));
  return { branches, depth };
}
