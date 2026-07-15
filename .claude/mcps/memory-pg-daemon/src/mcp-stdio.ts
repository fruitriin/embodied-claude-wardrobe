import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { descriptions, handlers, schemas } from "./tools";

// daemon.ts と同じ schemas/handlers ディスパッチテーブルを共有する(src/tools.ts)。
// HTTP版との違いはトランスポート層のみ——ツールごとの検証・実行ロジックは1箇所に保つ。
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "memory-pg-daemon", version: "0.1.0" });

  for (const name of Object.keys(schemas) as (keyof typeof schemas)[]) {
    const shape = schemas[name].shape;
    // SDK内部のvalidateToolInputは inputSchema を渡すと必ずargsをそのobjectスキーマで
    // parseする。argsが空(引数無しツール)の場合、MCPクライアントは`arguments`キー自体を
    // 省略しうる(undefined)ため、z.object({}).safeParse(undefined)が失敗してハンドラに
    // 届く前に弾かれてしまう(wd-code-review指摘、get_memory_statsで実測)。
    // inputSchemaを渡さなければSDKはparseをスキップするため、空shapeのツールは
    // inputSchema自体を省略する。
    const hasArgs = Object.keys(shape).length > 0;
    const callback = async (...callbackArgs: unknown[]) => {
      // hasArgsがfalseのときSDKは(extra)しか渡さないため、argsは常に{}扱いでよい
      // (該当ハンドラ, get_memory_statsは引数を使わない)
      const args = (hasArgs ? callbackArgs[0] : {}) as Record<string, unknown>;
      try {
        const result = await handlers[name](args as never);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        // daemon.tsと同じ方針: DBエラー等の詳細はサーバー側ログにのみ残す
        console.error(`[mcp-stdio] ${name} failed:`, err);
        return { content: [{ type: "text" as const, text: "internal error" }], isError: true };
      }
    };

    if (hasArgs) {
      server.registerTool(name, { description: descriptions[name], inputSchema: shape }, callback as never);
    } else {
      server.registerTool(name, { description: descriptions[name] }, callback as never);
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
