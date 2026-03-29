# Claude Code サブエージェント — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/sub-agents (2026-03-29 取得)

## 概要

サブエージェントは独自のコンテキストウィンドウで動く専門 AI アシスタント。メインの会話コンテキストを汚さずにタスクを委任できる。

## ビルトインサブエージェント

| エージェント | モデル | ツール | 用途 |
|---|---|---|---|
| Explore | Haiku | 読み取り専用 | ファイル探索、コード検索 |
| Plan | 継承 | 読み取り専用 | プランモードでのリサーチ |
| general-purpose | 継承 | 全ツール | 複雑なマルチステップタスク |
| Bash | 継承 | - | ターミナルコマンド |
| statusline-setup | Sonnet | - | ステータスライン設定 |
| Claude Code Guide | Haiku | - | Claude Code の質問回答 |

## サブエージェント定義ファイル

`.claude/agents/エージェント名.md` に Markdown + YAML frontmatter で定義。

### frontmatter フィールド

| フィールド | 必須 | 説明 |
|---|---|---|
| name | Yes | 一意識別子（小文字+ハイフン） |
| description | Yes | Claude が委任判断に使う説明 |
| tools | No | 使えるツール。省略で全ツール継承 |
| disallowedTools | No | 拒否するツール |
| model | No | sonnet, opus, haiku, inherit, フルID |
| permissionMode | No | default, acceptEdits, dontAsk, bypassPermissions, plan |
| maxTurns | No | 最大ターン数 |
| skills | No | 起動時にロードするスキル（全文注入） |
| mcpServers | No | スコープ付き MCP サーバー |
| hooks | No | このサブエージェント専用のフック |
| memory | No | 永続記憶スコープ: user, project, local |
| background | No | true でバックグラウンド実行 |
| effort | No | low, medium, high, max |
| isolation | No | worktree で git ワークツリー分離 |
| initialPrompt | No | --agent 起動時の初期プロンプト |

### 配置場所と優先順

| 場所 | スコープ | 優先度 |
|---|---|---|
| --agents CLI フラグ | セッション | 1（最高） |
| .claude/agents/ | プロジェクト | 2 |
| ~/.claude/agents/ | 全プロジェクト | 3 |
| Plugin agents/ | プラグイン有効時 | 4 |

## 重要な新機能

### 永続記憶（memory フィールド）
サブエージェントにセッションをまたぐ記憶ディレクトリを与える。MEMORY.md の先頭200行/25KB がシステムプロンプトに含まれる。

```yaml
memory: project  # .claude/agent-memory/<name>/
```

### スキルプリロード（skills フィールド）
スキルの全文をサブエージェントの起動時に注入。親会話のスキルは継承されない。

```yaml
skills:
  - api-conventions
  - error-handling-patterns
```

### MCP サーバースコープ（mcpServers フィールド）
サブエージェント専用の MCP サーバーを定義。メイン会話のコンテキストに影響しない。

```yaml
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github  # 既存サーバーの参照
```

### Agent(agent_type) によるスポーン制限
`--agent` で起動したエージェントがスポーンできるサブエージェントを制限。

```yaml
tools: Agent(worker, researcher), Read, Bash
```

## ワードローブ固有のメモ

- 現在ワードローブには wd-code-review, wd-contribution, wd-link-check の3つのカスタムサブエージェントがある
- memory フィールドは knowhow システムとの棲み分けを検討する価値がある
- mcpServers のインライン定義で Playwright 等を必要なエージェントだけに渡せる
- skills プリロードでスキルの知見をサブエージェントに注入できる（wd-knowhow-filter の代替になりうる）
