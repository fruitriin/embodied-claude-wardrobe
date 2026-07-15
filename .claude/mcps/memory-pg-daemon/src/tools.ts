import { z } from "zod";
import {
  consolidateMemories,
  createEpisode,
  getCausalChain,
  getMemoryStats,
  linkMemories,
  listRecentMemories,
  recall,
  recallByCameraPosition,
  recallWithAssociations,
  remember,
  saveVisualMemory,
  searchMemories,
} from "./store";

// Memory Tool Contract（remote-memory-mcp.md 設計判断1）準拠のツール名→スキーマ→ハンドラの
// ディスパッチテーブル。HTTP Daemon（daemon.ts）とMCP stdioアダプタ（mcp-stdio.ts）の
// 両方がこれを共有する。引数はcamelCaseのままstore.tsのシグネチャに合わせる。
const emotion = z.enum(["happy", "sad", "surprised", "moved", "excited", "nostalgic", "curious", "neutral"]);
const evidenceType = z.enum(["observed", "inferred", "remembered", "heard", "assumed"]);
const linkType = z.enum(["caused_by", "leads_to", "related", "similar", "similar_auto"]);

export const schemas = {
  remember: z.object({
    content: z.string(),
    opts: z
      .object({
        emotion: emotion.optional(),
        importance: z.number().optional(),
        category: z.string().optional(),
        evidenceType: evidenceType.optional(),
        tags: z.array(z.string()).optional(),
        flashKeywords: z.string().optional(),
        autoLink: z.boolean().optional(),
        linkThreshold: z.number().optional(),
      })
      .optional(),
  }),
  recall: z.object({ context: z.string(), nResults: z.number().optional() }),
  search_memories: z.object({
    query: z.string(),
    nResults: z.number().optional(),
    filter: z
      .object({
        emotion: z.string().optional(),
        category: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
      .optional(),
  }),
  list_recent_memories: z.object({ limit: z.number().optional(), categoryFilter: z.string().optional() }),
  get_memory_stats: z.object({}),
  link_memories: z.object({
    sourceId: z.string(),
    targetId: z.string(),
    linkType: linkType.optional(),
    note: z.string().optional(),
  }),
  get_causal_chain: z.object({
    memoryId: z.string(),
    direction: z.enum(["backward", "forward", "any"]).optional(),
    maxDepth: z.number().optional(),
  }),
  create_episode: z.object({
    title: z.string(),
    memoryIds: z.array(z.string()),
    opts: z.object({ participants: z.array(z.string()).optional(), summary: z.string().optional() }).optional(),
  }),
  recall_with_associations: z.object({
    context: z.string(),
    nResults: z.number().optional(),
    chainDepth: z.number().optional(),
  }),
  save_visual_memory: z.object({
    content: z.string(),
    imagePath: z.string(),
    cameraPosition: z.object({
      panAngle: z.number(),
      tiltAngle: z.number(),
      presetId: z.string().optional(),
    }),
    opts: z.object({ emotion: emotion.optional(), importance: z.number().optional() }).optional(),
  }),
  recall_by_camera_position: z.object({
    panAngle: z.number(),
    tiltAngle: z.number(),
    tolerance: z.number().optional(),
  }),
  consolidate_memories: z.object({
    windowHours: z.number().optional(),
    maxReplayEvents: z.number().optional(),
    linkUpdateStrength: z.number().optional(),
  }),
} as const;

export type ToolName = keyof typeof schemas;

type Handlers = { [K in ToolName]: (body: z.infer<(typeof schemas)[K]>) => Promise<unknown> };

export const handlers: Handlers = {
  remember: (b) => remember(b.content, b.opts ?? {}),
  recall: (b) => recall(b.context, b.nResults ?? 5),
  search_memories: (b) => searchMemories(b.query, b.nResults ?? 5, b.filter ?? {}),
  list_recent_memories: (b) => listRecentMemories(b.limit ?? 10, b.categoryFilter),
  get_memory_stats: () => getMemoryStats(),
  link_memories: (b) => linkMemories(b.sourceId, b.targetId, b.linkType ?? "caused_by", b.note),
  get_causal_chain: (b) => getCausalChain(b.memoryId, b.direction ?? "backward", b.maxDepth ?? 5),
  create_episode: (b) => createEpisode(b.title, b.memoryIds, b.opts ?? {}),
  recall_with_associations: (b) => recallWithAssociations(b.context, b.nResults ?? 3, b.chainDepth ?? 1),
  save_visual_memory: (b) => saveVisualMemory(b.content, b.imagePath, b.cameraPosition, b.opts ?? {}),
  recall_by_camera_position: (b) => recallByCameraPosition(b.panAngle, b.tiltAngle, b.tolerance ?? 15),
  consolidate_memories: (b) =>
    consolidateMemories(b.windowHours ?? 24, b.maxReplayEvents ?? 200, b.linkUpdateStrength ?? 0.2),
};

// ツール名はASCII必須(API規約)だが説明は日本語で完全に動く(設計判断7)。
// モデルがツールを選ぶ判断材料はnameでなくdescriptionのため、ニュアンスはここに載せる。
export const descriptions: Record<ToolName, string> = {
  remember: "記憶を1件保存する。埋め込みを計算し、類似記憶への自動リンクも行う",
  recall: "文脈に意味的に近い記憶を検索する(pgvectorのコサイン距離順)",
  search_memories: "感情・カテゴリ・期間で絞り込みながら記憶を意味検索する",
  list_recent_memories: "直近の記憶を新しい順に取得する",
  get_memory_stats: "記憶の総数・カテゴリ別/感情別の内訳・期間を集計する",
  link_memories: "2つの記憶の間に因果・関連リンクを張る",
  get_causal_chain: "指定した記憶からリンクを辿って因果連鎖を取得する",
  create_episode: "複数の記憶を1つのエピソードにまとめる",
  recall_with_associations: "意味検索の結果に、各結果からリンクを辿った関連記憶を加えて返す",
  save_visual_memory: "カメラで見た内容を画像パス・カメラ位置とともに記憶として保存する",
  recall_by_camera_position: "指定したカメラ位置(パン・チルト角)の許容誤差内で記憶を検索する",
  consolidate_memories:
    "直近の記憶をリプレイして共活性化・関連リンクを強化し、新鮮度減衰と重要度の自然な昇格/降格を行う" +
    "(合成記憶生成等の高度な統合フェーズは専用テーブル未実装のため対象外)",
};

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(schemas, name);
}
