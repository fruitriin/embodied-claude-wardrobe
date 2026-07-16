# MCP のツールシグネチャを config 駆動で増減する

## わかったこと

- **MCP ツールの足し引きは config 差し替え（+ 再起動）で実現できる。Python でも可能**。「Python ではできない」印象は FastMCP のデコレータ流儀（`@mcp.tool()` をコードに書き並べる）が静的に見えるだけで、実体は起動時の登録処理にすぎない
  - **Python**: `FastMCP.add_tool(fn, name=..., description=...)` を config を読んだループで呼ぶ。低レベル API なら `list_tools` ハンドラの返すツール一覧自体を config から組み立てる
  - **TypeScript**: `McpServer.registerTool()` を同様にループで。さらに TS SDK は実行時の `tool.remove()` + **listChanged 通知**に対応し、Claude Code 2.1.0+ は再接続なしにツール更新を反映する（[claude-code/mcp.md](../claude-code/mcp.md)）
- **ツール名は Claude API 規約で ASCII（`a-zA-Z0-9_-`）必須**。日本語はツール名には使えないが、**description・引数説明・enum 値は日本語で完全に動く**。モデルがツールを選ぶ判断材料は名前でなく description なので、ニュアンスは日本語 description に載せる

## ワードローブでの需要（設計判断として残す）

身体構成は環境ごとに違い、時間とともに変わる。ツールセットはそれに追従したい:

- **視覚・聴覚**: カメラが何台あるか（wifi-cam / usb-webcam / ip-webcam）でパン・チルトや切り替えツールの有無が変わる
- **mcp-pet（PErsonal Terminal）**: 接続されているときだけ端末系ツールを生やしたい
- **記憶バックエンド**: postgres-memory の「最小契約11本 + 拡張契約」を config でオン/オフ（[remote-memory-mcp.md](../../plans/remote-memory-mcp.md) 設計判断 7）

## やり方

1. ツール定義（name / 日本語 description / input_schema / ハンドラ指定）を JSON/TOML に外出しする
2. サーバー起動時に config を読み、登録 API をループで呼ぶ。ディスパッチャは名前→ハンドラの表引き
3. 増減は config 編集 + MCP 再起動（`/mcp` reconnect）で完結。コード変更なし
4. ハードウェア検出と連動させるなら、起動時にプローブして config とマージする（例: カメラ列挙 → 台数分のツールを生成）

## 気をつけること

- ツールセットの変更は**プロンプトキャッシュを無効化する**（tools はプレフィックス先頭）。頻繁な動的増減はコスト面で不利。セッション単位の増減に留めるのが筋
- 再起動なしの listChanged は TS のみ実用段階。Python は再起動運用で設計する
- ツール数が増えると Claude Code 2.1.7+ の自動 defer（ツール検索モード）が発動する。description の書き味が検索性に直結する

## 参照

- [claude-code/mcp.md](../claude-code/mcp.md) — list_changed / ツール検索自動モードの仕様
- [remote-memory-mcp.md](../../plans/remote-memory-mcp.md) — 設計判断 7（config 駆動シグネチャの適用第一号）
