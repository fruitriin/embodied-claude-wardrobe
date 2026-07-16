import { memoryTokens } from "./predictive";
import type { LinkType, Memory } from "./types";

// recall_divergentのグローバルワークスペース風候補選択。
// 旧wardrobe SQLite版(.claude/mcps/memory-mcp/src/memory_mcp/workspace.py)の移植。
// DBに依存しない純粋関数のみ。SQLite版はMemory.linksを直接参照していたが、
// Postgres版はmemory_linksを別テーブルで持つ設計のため、boundary計算に必要な
// リンク情報(型の集合・件数)は呼び出し側が事前に取得して渡す形に変更した。

export interface WorkspaceCandidate {
  memory: Memory;
  relevance: number;
  novelty: number;
  predictionError: number;
  emotionBoost: number;
  boundaryScore: number;
}

// LinkType の全種類数。旧Python版は4種(similar/caused_by/leads_to/related)固定だったが、
// Postgres版はauto-link用のsimilar_autoが増えて5種になっている(型定義との食い違いに
// よるスコア>1.0のバグを防ぐため、ハードコードでなくLinkType定義から動的に導出する)
const LINK_TYPES: readonly LinkType[] = ["caused_by", "leads_to", "related", "similar", "similar_auto"];

// リンクの型の多様性 + 件数を手がかりにした軽量なboundaryスコア(合成記憶インフラ
// 未実装のあいだの代理指標)。linkTypesはある記憶から張られたリンクのlink_type一覧。
// 【次サイクルへの申し送り、wd-code-review指摘】呼び出し側でmemory_linksテーブルから
// 集計する際、旧Python版のMemory.linksが発リンク(source_id=自分)のみか双方向かを
// store.py側で確認してから、SELECT ... WHERE source_id = $1 のクエリ範囲を合わせること
export function calculateBoundaryScore(linkTypes: LinkType[], linkCount: number): number {
  if (linkCount === 0) return 0;
  const uniqueTypes = new Set(linkTypes).size;
  const typeDiversity = uniqueTypes / LINK_TYPES.length;
  const countFactor = Math.min(1, linkCount / 5);
  return (typeDiversity + countFactor) / 2;
}

function candidateUtility(candidate: WorkspaceCandidate, redundancyPenalty: number, temperature: number): number {
  const temp = Math.max(0.1, Math.min(2.0, temperature));
  const importanceFactor = (candidate.memory.importance - 1) / 4; // [0,1]
  const utility =
    0.4 * candidate.relevance +
    0.18 * candidate.novelty +
    0.18 * candidate.predictionError +
    0.1 * candidate.emotionBoost +
    0.09 * candidate.boundaryScore +
    0.05 * importanceFactor -
    0.25 * redundancyPenalty;
  return utility / temp;
}

function redundancyPenalty(memory: Memory, selected: Memory[]): number {
  if (selected.length === 0) return 0;

  const targetTokens = memoryTokens(memory);
  if (targetTokens.size === 0) return 0;

  let maxOverlap = 0;
  for (const item of selected) {
    const itemTokens = memoryTokens(item);
    if (itemTokens.size === 0) continue;
    const union = new Set([...targetTokens, ...itemTokens]);
    if (union.size === 0) continue;
    let overlap = 0;
    for (const t of targetTokens) if (itemTokens.has(t)) overlap++;
    maxOverlap = Math.max(maxOverlap, overlap / union.size);
  }
  return maxOverlap;
}

// 反復的な勝者総取り(winner-take-all)競合による候補選択。選んだ候補と重複しすぎる
// 候補ほどredundancyPenaltyで割り引かれ、多様な記憶が選ばれやすくなる
export function selectWorkspaceCandidates(
  candidates: WorkspaceCandidate[],
  maxResults: number,
  temperature = 0.7
): { candidate: WorkspaceCandidate; score: number }[] {
  if (maxResults <= 0 || candidates.length === 0) return [];

  const selected: { candidate: WorkspaceCandidate; score: number }[] = [];
  const chosenMemories: Memory[] = [];
  let remaining = candidates;

  while (remaining.length > 0 && selected.length < maxResults) {
    let best: { candidate: WorkspaceCandidate; score: number } | undefined;
    for (const cand of remaining) {
      const penalty = redundancyPenalty(cand.memory, chosenMemories);
      const score = candidateUtility(cand, penalty, temperature);
      if (!best || score > best.score) best = { candidate: cand, score };
    }
    if (!best) break;
    selected.push(best);
    chosenMemories.push(best.candidate.memory);
    remaining = remaining.filter((c) => c.memory.id !== best!.candidate.memory.id);
  }

  return selected;
}

// 選ばれた記憶集合の平均ペアワイズ多様性を[0,1]で返す(診断用)
export function diversityScore(memories: Memory[]): number {
  if (memories.length <= 1) return 0;

  const pairScores: number[] = [];
  for (let i = 0; i < memories.length; i++) {
    const leftTokens = memoryTokens(memories[i]!);
    for (let j = i + 1; j < memories.length; j++) {
      const rightTokens = memoryTokens(memories[j]!);
      const union = new Set([...leftTokens, ...rightTokens]);
      if (union.size === 0) {
        pairScores.push(0);
        continue;
      }
      let overlap = 0;
      for (const t of leftTokens) if (rightTokens.has(t)) overlap++;
      pairScores.push(1 - overlap / union.size);
    }
  }

  if (pairScores.length === 0) return 0;
  return pairScores.reduce((a, b) => a + b, 0) / pairScores.length;
}
