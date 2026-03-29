# Claude Code MCP — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/mcp + CHANGELOG 1.0.0〜2.1.87 (2026-03-29 取得)

## 導入・進化の経緯

| バージョン | 変更 |
|---|---|
| 1.0.4 | MCP ツールエラーパース修正 |
| 1.0.18 | /mcp 詳細表示、SSE 自動再接続 |
| 1.0.27 | Streamable HTTP MCP サーバー対応、OAuth 対応、MCP リソース @メンション |
| 1.0.35 | OAuth Authorization Server discovery |
| 1.0.48 | 環境変数展開（${VAR}）対応 |
| 1.0.52 | MCP サーバー instructions 対応 |
| 1.0.73 | --mcp-config で複数設定ファイル対応 |
| 1.0.82 | ツール名の一貫性改善 |
| 1.0.110 | OAuth トークンの事前リフレッシュ |
| 1.0.119 | headersHelper による動的ヘッダー |
| 2.0.10 | @メンションで MCP サーバーの有効/無効切り替え |
| 2.0.21 | structuredContent 対応 |
| 2.0.30 | SSE サーバーをネイティブビルドで有効化 |
| 2.0.70 | ワイルドカード mcp__server__* パーミッション |
| 2.1.0 | list_changed 通知対応（動的ツール更新） |
| 2.1.7 | MCP ツール検索自動モード（10%超えで自動 defer） |
| 2.1.9 | auto:N 構文でしきい値カスタマイズ |
| 2.1.30 | --client-id/--client-secret で OAuth クライアント資格情報 |
| 2.1.46 | claude.ai MCP connectors を Claude Code で使用可能 |
| 2.1.85 | CLAUDE_CODE_MCP_SERVER_NAME/URL 環境変数を headersHelper に追加 |

## .mcp.json の設定

### サーバータイプ

| タイプ | 説明 | 追加時期 |
|---|---|---|
| stdio | ローカルプロセス（デフォルト） | 初期 |
| http | Streamable HTTP | 1.0.27 |
| sse | Server-Sent Events | 初期 |
| ws | WebSocket | 不明 |

### 設定例

```json
{
  "mcpServers": {
    "server-name": {
      "command": "uv",
      "args": ["run", "--directory", "my-mcp", "my-mcp"],
      "env": {
        "CLAUDE_PROJECT_DIR": "${PWD}"
      }
    }
  }
}
```

### リモートサーバー

```json
{
  "mcpServers": {
    "remote": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

## 環境変数展開（1.0.48〜）

- `${VAR}` — 環境変数に展開
- `${VAR:-default}` — デフォルト値つき

展開できる場所: command, args, env, url, headers

## headersHelper（1.0.119〜）

認証トークンの動的取得用スクリプト。

環境変数:
- `CLAUDE_CODE_MCP_SERVER_NAME` — サーバー名 (2.1.85〜)
- `CLAUDE_CODE_MCP_SERVER_URL` — サーバー URL (2.1.85〜)

## MCP ツール検索自動モード（2.1.7〜）

MCP ツールの description がコンテキストウィンドウの10%を超えると、自動的に defer して MCPSearch ツール経由で検索。
`auto:N` (2.1.9〜) でしきい値をカスタマイズ可能。
無効化: `disallowedTools` に `MCPSearch` を追加。

## CLI での MCP 管理

```bash
claude mcp add my-server --transport stdio -- command args
claude mcp add remote --transport http https://example.com/mcp
claude mcp add oauth-server --client-id ID --client-secret SECRET -- cmd
claude mcp list
claude mcp remove my-server
```

## パーミッション

```json
{
  "permissions": {
    "allow": ["mcp__memory__*"],
    "deny": ["mcp__dangerous__delete_*"]
  }
}
```

ワイルドカード `mcp__server__*` (2.0.70〜) でサーバー単位の制御。

## サブエージェントとの連携

mcpServers フィールドでサブエージェント専用 MCP を定義。インライン定義はメイン会話のコンテキストに影響しない。

## ワードローブ固有のメモ

- `${PWD}` を CLAUDE_PROJECT_DIR として全 MCP に渡す設定を導入済み
- Claude Code CLI では `http` タイプを使う（`streamable-http` は別名で実質同じだが、xpoz で Parse Error が出た）
- `claude mcp add` で .mcp.json を直接編集せずにサーバー追加可能
- headersHelper + CLAUDE_CODE_MCP_SERVER_NAME/URL で OAuth トークンの動的取得が可能
- MCP ツール検索自動モードにより、ツールが多い環境でもコンテキスト節約
- list_changed (2.1.0〜) で MCP サーバーが再接続なしにツール更新を通知可能
- claude.ai MCP connectors (2.1.46〜) は外部 SaaS の MCP を Claude Code から利用する手段
