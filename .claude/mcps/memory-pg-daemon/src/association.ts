import { queryAmbiguityScore } from "./predictive";

// recall_divergentの連想的グラフ拡張。
// 旧wardrobe SQLite版(.claude/mcps/memory-mcp/src/memory_mcp/association.py)の移植。
// 現時点ではDBに依存しない純粋関数(adaptiveSearchParams)のみ。
// グラフ拡張本体(AssociationEngine.spread相当、memory_links/coactivationテーブルを
// 辿るDB依存部分)はrecallDivergentのオーケストレーション実装と合わせて別途行う
// (スコープ調査: .claude/addf/plans/remote-memory-mcp.md 参照)。

export interface AssociationDiagnostics {
  branchesUsed: number;
  depthUsed: number;
  traversedEdges: number;
  expandedNodes: number;
  avgBranchingFactor: number;
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
