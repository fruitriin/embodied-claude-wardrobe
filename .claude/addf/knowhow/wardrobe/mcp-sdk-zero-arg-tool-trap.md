# MCP SDKで引数無しツールに`z.object({})`を渡すと落とし穴を踏む

## わかったこと

- `@modelcontextprotocol/sdk`の`McpServer.registerTool(name, { inputSchema, ... }, callback)`は、`inputSchema`を渡すと**必ず**`request.params.arguments`をそのスキーマでparseしてからcallbackを呼ぶ（`validateToolInput`、`server/mcp.js`）
- MCPクライアントは「引数無しツール」を呼ぶとき、`arguments`キー自体を省略しうる（`undefined`になる）
- ここで`inputSchema`に`z.object({}).shape`（空のraw shape）を渡していると、SDK内部で`z.object({}).safeParse(undefined)`相当が実行され、**`undefined`はobjectではないので検証エラーになり、callbackに届く前にInvalidParamsで弾かれる**
- HTTP経由のDaemonでは「bodyが空文字なら`{}`にフォールバックする」実装をこちらで書いていたため気づきにくい。MCP版で初めて顕在化した

## やり方

- ツールの引数スキーマが空（`Object.keys(shape).length === 0`）の場合は、**`registerTool`に`inputSchema`キー自体を渡さない**。`inputSchema`が無ければSDKは`validateToolInput`内で即座に`undefined`を返し、parseをスキップする
  ```ts
  const hasArgs = Object.keys(shape).length > 0;
  if (hasArgs) {
    server.registerTool(name, { description, inputSchema: shape }, callback);
  } else {
    server.registerTool(name, { description }, callback); // inputSchemaを渡さない
  }
  ```
- ただし`inputSchema`を省略すると、SDKの型上コールバックのシグネチャが`(args, extra) => ...`から`(extra) => ...`に変わる（`ToolCallback<Args>`の条件型）。動的にツール名をループで回して登録するコードでは、`callback`を`(...args: unknown[]) => ...`のような可変長引数で書き、`hasArgs`で分岐して先頭引数を使うかどうかを決めるとシンプルに両対応できる

## 気をつけること

- **`InMemoryTransport.createLinkedPair()`によるテストだけでは検出できない**——`Client.callTool({ name, arguments: {...} })`のように明示的に空オブジェクトを渡すテストを書くと、SDK側の検証は素通りしてしまい、実際のMCPホストが`arguments`キーを省略する場合の挙動を再現できない。回帰テストを書くときは`client.callTool({ name })`（`arguments`キーを渡さない形）を明示的に用意すること
- この罠はHTTP APIやその他のRPC層には無い、MCP SDK固有の挙動。「HTTP版で動いたから同じロジックをMCP化しても動くはず」という前提が崩れる典型例

## 参照

- `.claude/mcps/memory-pg-daemon/src/mcp-stdio.ts`
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`（`validateToolInput`）
- 2026-07-15 コミット `feat(memory-pg-daemon): MCP stdioアダプタを実装`
