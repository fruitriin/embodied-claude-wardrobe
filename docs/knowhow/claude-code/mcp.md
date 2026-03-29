# Claude Code MCP — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/mcp (2026-03-29 取得)

## .mcp.json の設定

### サーバータイプ

| タイプ | 説明 | 設定例 |
|---|---|---|
| stdio | ローカルプロセス（デフォルト） | command + args |
| http | Streamable HTTP | type: "http", url |
| sse | Server-Sent Events | type: "sse", url |
| ws | WebSocket | type: "ws", url |

### 設定構造

```json
{
  "mcpServers": {
    "server-name": {
      "command": "uv",
      "args": ["run", "--directory", "my-mcp", "my-mcp"],
      "env": {
        "API_KEY": "value",
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
    "remote-server": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

## 環境変数展開

`.mcp.json` で使える:
- `${VAR}` — 環境変数に展開
- `${VAR:-default}` — デフォルト値つき

展開できる場所: command, args, env, url, headers

## headersHelper

認証トークンの動的取得用スクリプト:

```json
{
  "mcpServers": {
    "authenticated": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headersHelper": "python3 get_token.py"
    }
  }
}
```

スクリプトに渡される環境変数:
- `CLAUDE_CODE_MCP_SERVER_NAME` — サーバー名
- `CLAUDE_CODE_MCP_SERVER_URL` — サーバー URL

## CLI での MCP 管理

```bash
# サーバー追加
claude mcp add my-server --transport stdio -- command args
claude mcp add remote --transport http https://example.com/mcp

# サーバー一覧
claude mcp list

# サーバー削除
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

パターン: `mcp__<server>__<tool>` でサーバー・ツール単位の制御。

## サブエージェントとの連携

サブエージェントの frontmatter で MCP サーバーをスコープ指定:

```yaml
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github  # 既存サーバーの参照
```

インライン定義はサブエージェント専用。メイン会話のコンテキストに影響しない。

## ワードローブ固有のメモ

- `${PWD}` を CLAUDE_PROJECT_DIR として全 MCP に渡す設定を導入済み
- `streamable-http` は Claude Desktop 向け。Claude Code CLI では `http` タイプを使う
- Xpoz（X 検索）は `streamable-http` のため Claude Code CLI では動作しなかった
- `claude mcp add` コマンドで .mcp.json を直接編集せずにサーバー追加可能
- headersHelper で OAuth トークンの動的取得が可能（xpoz 等で使えるかも）
