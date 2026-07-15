import { z } from "zod";
import {
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

// Memory Tool Contract（remote-memory-mcp.md 設計判断1）準拠のツール名でルーティングする。
// 引数はcamelCaseのまま(store.tsのシグネチャに合わせる)。MCPアダプタ層を被せるときも
// このディスパッチテーブルをそのまま再利用できる。
const emotion = z.enum(["happy", "sad", "surprised", "moved", "excited", "nostalgic", "curious", "neutral"]);
const evidenceType = z.enum(["observed", "inferred", "remembered", "heard", "assumed"]);
const linkType = z.enum(["caused_by", "leads_to", "related", "similar", "similar_auto"]);

const schemas = {
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
} as const;

type ToolName = keyof typeof schemas;
type Handlers = { [K in ToolName]: (body: z.infer<(typeof schemas)[K]>) => Promise<unknown> };

const handlers: Handlers = {
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
};

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(schemas, name);
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const toolName = url.pathname.replace(/^\//, "");
  if (!isToolName(toolName)) {
    return Response.json({ error: `unknown tool: ${toolName}` }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    const text = await req.text();
    rawBody = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = schemas[toolName].safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid request body", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await handlers[toolName](parsed.data as never);
    return Response.json({ result });
  } catch (err) {
    // DBエラー等の詳細はサーバー側ログにのみ残し、クライアントには汎用メッセージを返す
    // (wd-code-review指摘: err.messageの生返却はDB由来の内部情報を漏らしうる)
    console.error(`[daemon] ${toolName} failed:`, err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

// 認証層はまだ無い(Phase3のWeb経路で確定予定、設計判断4)。ローカルDaemonの前提
// (設計判断10「ローカルで動く形をデフォルト」)を踏まえ、明示的にHOSTを変えない限り
// 127.0.0.1のみ待受してLAN露出を避ける。
// maxRequestBodySizeはBunのデフォルト(128MB)に依存せず明示指定して過大リクエストを早期に弾く。
export function startDaemon(port = Number(process.env.PORT ?? 8787), hostname = process.env.HOST ?? "127.0.0.1") {
  const server = Bun.serve({ port, hostname, fetch: handleRequest, maxRequestBodySize: 1024 * 1024 });
  return server;
}

if (import.meta.main) {
  const server = startDaemon();
  console.log(`memory-pg-daemon listening on http://${server.hostname}:${server.port}`);
}
