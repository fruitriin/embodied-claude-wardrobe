# Claude Code Hooks — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/hooks (2026-03-29 取得)

## イベント一覧（25種類）

| イベント | 発火タイミング | ブロック可能 | matcher 対象 |
|---|---|---|---|
| SessionStart | セッション開始/再開 | - | startup, resume, clear, compact |
| SessionEnd | セッション終了 | - | clear, logout, other |
| UserPromptSubmit | ユーザー入力前処理 | Yes | - |
| PreToolUse | ツール実行前 | Yes | ツール名 |
| PostToolUse | ツール成功後 | Yes | ツール名 |
| PostToolUseFailure | ツール失敗後 | - | ツール名 |
| PermissionRequest | パーミッションダイアログ表示時 | Yes | - |
| Stop | Claude 応答完了時 | Yes | - |
| StopFailure | API エラー時 | - | rate_limit, authentication_failed |
| SubagentStart | サブエージェント起動 | - | エージェント型 |
| SubagentStop | サブエージェント終了 | Yes | エージェント型 |
| TaskCreated | タスク作成 | Yes | - |
| TaskCompleted | タスク完了 | Yes | - |
| TeammateIdle | チームメイト待機 | Yes | - |
| Notification | 通知送信 | - | permission_prompt, idle_prompt |
| InstructionsLoaded | CLAUDE.md 読込 | - | - |
| ConfigChange | 設定ファイル変更 | Yes | user_settings, project_settings |
| CwdChanged | 作業ディレクトリ変更 | - | - |
| FileChanged | 監視ファイル変更 | - | ファイル名 |
| WorktreeCreate | ワークツリー作成 | Yes | - |
| WorktreeRemove | ワークツリー削除 | - | - |
| PreCompact | コンパクト前 | - | - |
| PostCompact | コンパクト後 | - | - |
| Elicitation | MCP ユーザー入力要求 | Yes | - |
| ElicitationResult | MCP ユーザー入力応答 | Yes | - |

## フックタイプ（4種類）

| タイプ | 説明 | 主なフィールド |
|---|---|---|
| command | シェルコマンド実行 | command, async, shell |
| http | HTTP リクエスト | url, headers, allowedEnvVars |
| prompt | LLM プロンプト検証 | prompt, model |
| agent | エージェント型検証 | prompt, model |

## 条件付き `if` フィールド（v2.1.85〜）

ツールイベント（PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest）でのみ有効。

```json
{
  "type": "command",
  "if": "Bash(rm *)",
  "command": "validate.sh"
}
```

パターン例:
- `"Bash"` — 全 Bash コマンド
- `"Edit|Write"` — Edit または Write
- `"Bash(git *)"` — git コマンド
- `"Edit(*.ts)"` — TypeScript ファイル編集
- `"mcp__memory__.*"` — memory MCP の全ツール

**ワードローブへの影響**: matcher + if の組み合わせで、プロセス生成を減らせる。interoception.sh などは毎ターン実行されるが、if 条件で不要なフック実行をスキップ可能。

## 環境変数

全フックで使える:
- `CLAUDE_PROJECT_DIR` — プロジェクトルート
- `CLAUDE_CODE_REMOTE` — リモート環境なら "true"

SessionStart/CwdChanged/FileChanged で追加:
- `CLAUDE_ENV_FILE` — 環境変数永続化ファイル（ここに export 文を追記すると永続化）

## Exit Code

| Code | 意味 | 動作 |
|---|---|---|
| 0 | 成功 | JSON 処理、ツール実行許可 |
| 2 | ブロック | ツール中断/拒否（PreToolUse）、プロンプトブロック（UserPromptSubmit）、停止ブロック（Stop） |
| その他 | エラー | 実行継続（stderr 表示） |

## 設定ファイル優先順

1. `~/.claude/settings.json`（ユーザー）
2. `.claude/settings.json`（プロジェクト）
3. `.claude/settings.local.json`（ローカル）
4. Managed policy（管理者）
5. Plugin hooks
6. Skill/Agent frontmatter

## ワードローブ固有のメモ

- 現在 settings.json に未登録のフック: statusline.ts, continue-check.sh
- SessionStart(startup) で SOUL.md + state.md を注入する SessionStart フックが計画中
- `if` フィールドを使えば interoception.sh の条件付き実行が可能
- `CLAUDE_ENV_FILE` を使えば SessionStart で環境変数を永続化できる
