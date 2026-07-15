# Bun.serve + zod でMCPツール契約をHTTP Daemon化する

## わかったこと

- MCPツール契約（ツール名→引数→ハンドラ）は、MCPサーバーだけでなくHTTP Daemonでも同じ形のディスパッチテーブルで表現できる。`{ ツール名: zodスキーマ }` + `{ ツール名: (検証済みbody) => Promise<結果> }` の2つのオブジェクトを用意し、URLパス（`POST /{ツール名}`）でルーティングするだけで、契約ツール全体をHTTP APIとして薄く公開できる
- **TypeScriptでハンドラごとに正しい引数型を効かせるには、`Record<ToolName, (body: never) => Promise<unknown>>` のような単一シグネチャで縛ってはいけない**（`never`型では各ハンドラ内でプロパティアクセスができずコンパイルエラーになる）。代わりにマップ型で各キーごとに`z.infer`した型を割り当てる:
  ```ts
  type Handlers = { [K in ToolName]: (body: z.infer<(typeof schemas)[K]>) => Promise<unknown> };
  const handlers: Handlers = { remember: (b) => remember(b.content, b.opts ?? {}), ... };
  ```
  呼び出し側（動的ディスパッチ）では `handlers[toolName](parsed.data as never)` のように型を一度崩す必要があるが、それは「文字列で選んだ関数を呼ぶ」動的ディスパッチの本質的な限界であり、`isToolName`のようなtype guardで事前にnarrowingしておけば安全性は保たれる

## やり方

1. `zod`でツールごとの入力スキーマを定義する（既に依存関係にあるプロジェクトならコスト小）
2. `schemas[toolName].safeParse(body)`で検証し、失敗したら400 + `error.issues`をそのまま返す（クライアントが直せる形の詳細を返すのは安全——スキーマ違反はDB内部情報を含まない）
3. ハンドラ内で発生したエラー（DB例外等）は**クライアントに生の`err.message`を返さない**。`console.error`でサーバー側にログし、クライアントには`{ error: "internal error" }`のような汎用メッセージだけ返す。DBのエラー文言にはテーブル名・制約名・値などの内部情報が漏れうる
4. 認証層がまだ無いローカルDaemonは、`hostname`を明示的に`127.0.0.1`にしてLAN露出を避ける。`0.0.0.0`はリモート公開する段になってから明示的に選ぶ
5. `Bun.serve`の`maxRequestBodySize`をデフォルト値に依存せず明示指定し、過大なリクエストボディを早期に拒否する

## 気をつけること

- このパターンはMCP stdioアダプタを後から被せるときにも流用できる——`schemas`/`handlers`のディスパッチテーブルを共有し、MCP側は`tool.description`等のメタ情報を追加するだけで済む設計にしておくと二重実装を避けられる
- zodの`safeParse`結果の`error.issues`をそのまま返す設計は、スキーマにDB内部の列名がそのまま出ている場合など、情報設計次第では見直しが必要になりうる（今回のケースでは`content`/`nResults`等ユーザー向けの引数名なので問題なし）

## 参照

- `.claude/mcps/memory-pg-daemon/src/daemon.ts`
- `.claude/addf/knowhow/wardrobe/mcp-dynamic-tool-registry.md`（config駆動ツール登録の関連パターン）
- 2026-07-15 コミット `feat(memory-pg-daemon): HTTP Daemon化(Bun.serve)を実装`
