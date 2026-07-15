# MCP SDKで引数無し/全optionalなツールにshapeをそのまま渡すと落とし穴を踏む

## わかったこと

- `@modelcontextprotocol/sdk`の`McpServer.registerTool(name, { inputSchema, ... }, callback)`は、`inputSchema`を渡すと**必ず**`request.params.arguments`をそのスキーマでparseしてからcallbackを呼ぶ（`validateToolInput`、`server/mcp.js`）
- MCPクライアントは「引数無しツール」「全フィールドがoptionalなツール」を呼ぶとき、`arguments`キー自体を省略しうる（`undefined`になる）
- ここで問題になるのは2パターン、原因は共通(`undefined`はobjectではない)だが対策は異なる:
  1. **shapeが空(0キー)**: `inputSchema`に`z.object({}).shape`を渡していると、SDK内部で`z.object({}).safeParse(undefined)`相当が実行され検証エラーになりcallbackに届く前にInvalidParamsで弾かれる
  2. **shapeに1キー以上あるが全て`.optional()`**: `.optional()`は個々のプロパティを省略可能にするだけで、オブジェクトそのものが`undefined`であることは許容しない。実測: `z.object({ a: z.number().optional() }).safeParse(undefined)` は `{success: false}`。つまり必須フィールドの有無に関わらず、raw shapeをそのまま渡すツールは全て同じ失敗パターンを踏む
- HTTP経由のDaemonでは「bodyが空文字なら`{}`にフォールバックする」実装をこちらで書いていたため気づきにくい。MCP版で初めて顕在化した

## やり方

ツール名でループして動的に`registerTool`する設計では、3パターンに分岐する:

```ts
const shape = schemas[name].shape;
const hasInputSchema = Object.keys(shape).length > 0;
const allOptional = hasInputSchema && schemas[name].safeParse({}).success;

const callback = async (...callbackArgs: unknown[]) => {
  // inputSchema省略時(パターン1)、SDKは(extra)しか渡さないためargsは{}扱いでよい
  const args = (hasInputSchema ? callbackArgs[0] : {}) as Record<string, unknown>;
  // ...実処理...
};

if (!hasInputSchema) {
  // 1. 空shape → inputSchema自体を省略。SDKはvalidateToolInput内で即座にundefinedを
  //    返しparseをスキップする
  server.registerTool(name, { description }, callback);
} else if (allOptional) {
  // 2. 全optional(1キー以上) → z.preprocessでundefined→{}に変換してから検証。
  //    提供された値は引き続きバリデーションされコールバックまで届く(実測確認済み)
  server.registerTool(
    name,
    { description, inputSchema: z.preprocess((v) => v ?? {}, schemas[name]) },
    callback
  );
} else {
  // 3. 必須キーがある → 従来通りraw shapeをそのまま渡す。undefinedで弾かれるのが正しい
  server.registerTool(name, { description, inputSchema: shape }, callback);
}
```

- パターン1で`inputSchema`を省略すると、SDKの型上コールバックのシグネチャが`(args, extra) => ...`から`(extra) => ...`に変わる（`ToolCallback<Args>`の条件型）。動的ループで両対応するには`callback`を`(...args: unknown[]) => ...`のような可変長引数で書く

## 気をつけること

- **`InMemoryTransport.createLinkedPair()`によるテストだけでは検出できない**——`Client.callTool({ name, arguments: {...} })`のように明示的に空オブジェクトを渡すテストを書くと、SDK側の検証は素通りしてしまい、実際のMCPホストが`arguments`キーを省略する場合の挙動を再現できない。回帰テストを書くときは`client.callTool({ name })`（`arguments`キーを渡さない形）を明示的に用意すること
- この罠はHTTP APIやその他のRPC層には無い、MCP SDK固有の挙動。「HTTP版で動いたから同じロジックをMCP化しても動くはず」という前提が崩れる典型例
- **パターン2のトレードオフ**: `z.preprocess`でラップしたスキーマは、SDKの`listTools()`が返すJSON Schemaの`properties`が空になる（`normalizeObjectSchema`がpreprocess/defaultでラップされたスキーマの中身を展開できないため）。実際に動く値は正しく渡せるが、MCPクライアント側のツール選択UIやLLMへの「このツールはどんな引数を取るか」というヒントが失われる。`z.object(shape).default({})`でも本質的に同じ問題が起きる。ツールのdescriptionに主要な引数を文章で書き添えるなど、schemaの詳細が読めなくても使い方が伝わる工夫で補うとよい
- SDKが将来「手動JSON Schema注入」（`inputSchema`とは別にJSON Schemaを直接渡せるAPI）をサポートするようになったら、パターン2の回避策自体が不要になる可能性がある——SDKアップデート時に再確認する価値がある

## 参照

- `.claude/mcps/memory-pg-daemon/src/mcp-stdio.ts`
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`（`validateToolInput`）
- 2026-07-15 コミット `feat(memory-pg-daemon): MCP stdioアダプタを実装` / `feat(memory-pg-daemon): consolidate_memoriesを実装(契約ツール12/14完了)`
