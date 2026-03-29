# Claude Code サブエージェント — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/sub-agents + CHANGELOG 1.0.0〜2.1.87 (2026-03-29 取得)

## 導入・進化の経緯

| バージョン | 変更 |
|---|---|
| 1.0.60 | カスタムサブエージェント（/agents）リリース |
| 1.0.62 | @agent メンションでの呼び出し |
| 1.0.64 | model カスタマイズ対応 |
| 2.0.0 | --agents フラグで動的追加、Task→Agent リネーム |
| 2.0.17 | Explore サブエージェント（Haiku）導入 |
| 2.0.28 | Plan サブエージェント導入、resume サブエージェント、動的 model 選択 |
| 2.0.30 | disallowedTools フィールド追加、MCP ツールがサブエージェントで利用可能に |
| 2.0.43 | permissionMode フィールド追加、skills プリロード、SubagentStart フック |
| 2.0.59 | --agent CLI フラグ、agent 設定でメインスレッドをエージェント化 |
| 2.0.60 | バックグラウンドエージェント |
| 2.0.64 | 非同期実行、auto-background |
| 2.1.0 | agent frontmatter に hooks 対応、Agent(AgentName) で無効化、context:fork スキル |
| 2.1.33 | Task(agent_type) でスポーン制限、memory フィールド（永続記憶） |
| 2.1.47 | last_assistant_message が SubagentStop に追加 |
| 2.1.49 | isolation: worktree 対応、background: true フィールド |
| 2.1.50 | isolation: worktree をエージェント定義に宣言的に設定可能 |
| 2.1.63 | Task→Agent リネーム完了（Task は引き続きエイリアスとして動作） |

## ビルトインサブエージェント

| エージェント | モデル | ツール | 用途 | 追加時期 |
|---|---|---|---|---|
| Explore | Haiku | 読み取り専用 | ファイル探索、コード検索 | 2.0.17 |
| Plan | 継承 | 読み取り専用 | プランモードでのリサーチ | 2.0.28 |
| general-purpose | 継承 | 全ツール | 複雑なマルチステップタスク | 初期 |
| Bash | 継承 | - | ターミナルコマンド | 初期 |
| statusline-setup | Sonnet | - | ステータスライン設定 | 1.0.71 |
| Claude Code Guide | Haiku | - | Claude Code の質問回答 | 不明 |

## frontmatter フィールド

| フィールド | 必須 | 説明 | 追加時期 |
|---|---|---|---|
| name | Yes | 一意識別子（小文字+ハイフン） | 1.0.60 |
| description | Yes | Claude が委任判断に使う説明 | 1.0.60 |
| tools | No | 使えるツール。省略で全ツール継承 | 1.0.60 |
| disallowedTools | No | 拒否するツール | 2.0.30 |
| model | No | sonnet, opus, haiku, inherit, フルID | 1.0.64 |
| permissionMode | No | default, acceptEdits, dontAsk, bypassPermissions, plan | 2.0.43 |
| maxTurns | No | 最大ターン数 | 不明 |
| skills | No | 起動時にロードするスキル（全文注入） | 2.0.43 |
| mcpServers | No | スコープ付き MCP サーバー（インライン or 参照） | 不明 |
| hooks | No | このサブエージェント専用のフック | 2.1.0 |
| memory | No | 永続記憶スコープ: user, project, local | 2.1.33 |
| background | No | true でバックグラウンド実行 | 2.1.49 |
| effort | No | low, medium, high, max | 不明 |
| isolation | No | worktree で git ワークツリー分離 | 2.1.49 |
| initialPrompt | No | --agent 起動時の初期プロンプト | 不明 |

## 配置場所と優先順

| 場所 | スコープ | 優先度 |
|---|---|---|
| --agents CLI フラグ | セッション | 1（最高） |
| .claude/agents/ | プロジェクト | 2 |
| ~/.claude/agents/ | 全プロジェクト | 3 |
| Plugin agents/ | プラグイン有効時 | 4 |

## 重要な機能

### 永続記憶（memory フィールド、2.1.33〜）
MEMORY.md の先頭200行/25KBがシステムプロンプトに含まれる。

| スコープ | パス |
|---|---|
| user | ~/.claude/agent-memory/<name>/ |
| project | .claude/agent-memory/<name>/ |
| local | .claude/agent-memory-local/<name>/ |

### スポーン制限（Agent(agent_type)、2.1.33〜）
```yaml
tools: Agent(worker, researcher), Read, Bash
```

### worktree 分離（isolation: worktree、2.1.49〜）
一時的な git worktree で独立したコピーで作業。変更がなければ自動クリーンアップ。

### MCP サーバースコープ（mcpServers）
```yaml
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github  # 既存サーバーの参照
```

### バックグラウンド実行（2.0.60〜）
- Ctrl+B でフォアグラウンドタスクをバックグラウンドに
- background: true で常にバックグラウンド
- Ctrl+F で全バックグラウンドエージェントをキル (2.1.47〜)

## ワードローブ固有のメモ

- wd-code-review, wd-contribution, wd-link-check の3カスタムサブエージェントがある
- memory フィールドは knowhow システムとの棲み分けを検討する価値あり
- mcpServers インライン定義でメイン会話のコンテキストを汚さずに MCP を渡せる
- skills プリロードで knowhow をサブエージェントに注入できる
- worktree はワードローブの `git worktree` スキルと連携可能
- `claude agents` CLI (2.1.50〜) で設定済みエージェント一覧表示
