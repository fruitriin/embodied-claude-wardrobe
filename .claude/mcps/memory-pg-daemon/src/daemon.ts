import { handlers, isToolName, schemas } from "./tools";

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
