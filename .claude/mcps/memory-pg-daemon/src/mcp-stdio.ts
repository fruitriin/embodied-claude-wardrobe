import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { descriptions, handlers, schemas } from "./tools";

// daemon.ts と同じ schemas/handlers ディスパッチテーブルを共有する(src/tools.ts)。
// HTTP版との違いはトランスポート層のみ——ツールごとの検証・実行ロジックは1箇所に保つ。
//
// MCPクライアントは「引数無しツール」「全フィールドoptionalなツール」を呼ぶとき、
// `arguments`キー自体を省略しうる(request.params.arguments === undefined)。SDK内部の
// validateToolInputはinputSchemaを渡すと必ずargsをそのobjectスキーマでparseするため、
// z.object(shape).safeParse(undefined)は(shapeが空でも全optionalでも)失敗し、
// ハンドラに届く前に弾かれる(wd-code-review指摘、get_memory_statsで実測)。
// 対策は実測で確認した3パターンに分岐する:
//   1. shapeが空(0キー) → inputSchema自体を省略する。SDKはparseをスキップする
//   2. shapeが全optional(必須キー無し) → z.preprocess(v => v ?? {}, schema)で
//      undefined→{}に変換してから検証する。トレードオフ: listTools()が返す
//      JSON Schemaのpropertiesが空になる(SDKのJSON Schema変換がpreprocessで
//      ラップしたスキーマの中身を展開できないため)。動作の正しさを優先し許容する
//   3. 必須キーがある → 従来通りraw shapeをそのまま渡す(undefinedで弾かれるのが正しい)
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "memory-pg-daemon", version: "0.1.0" });

  for (const name of Object.keys(schemas) as (keyof typeof schemas)[]) {
    const shape = schemas[name].shape;
    const hasInputSchema = Object.keys(shape).length > 0;
    const allOptional = hasInputSchema && schemas[name].safeParse({}).success;

    const callback = async (...callbackArgs: unknown[]) => {
      // inputSchema省略時(パターン1)、SDKは(extra)しか渡さないためargsは{}扱いでよい
      const args = (hasInputSchema ? callbackArgs[0] : {}) as Record<string, unknown>;
      try {
        const result = await handlers[name](args as never);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        // daemon.tsと同じ方針: DBエラー等の詳細はサーバー側ログにのみ残す
        console.error(`[mcp-stdio] ${name} failed:`, err);
        return { content: [{ type: "text" as const, text: "internal error" }], isError: true };
      }
    };

    if (!hasInputSchema) {
      server.registerTool(name, { description: descriptions[name] }, callback as never);
    } else if (allOptional) {
      server.registerTool(
        name,
        { description: descriptions[name], inputSchema: z.preprocess((v) => v ?? {}, schemas[name]) },
        callback as never
      );
    } else {
      server.registerTool(name, { description: descriptions[name], inputSchema: shape }, callback as never);
    }
  }

  return server;
}

export async function startMcpStdio(transport: Transport = new StdioServerTransport()): Promise<McpServer> {
  const server = createMcpServer();
  await server.connect(transport);
  return server;
}

if (import.meta.main) {
  await startMcpStdio();
}
