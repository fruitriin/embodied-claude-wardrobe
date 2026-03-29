---
name: wd-cc-tracker
description: "Claude Code の最新変更を追跡し、ワードローブに関係する仕様変更を knowhow に反映する。changelog と公式ドキュメントを突き合わせ、hooks/subagents/skills/MCP/agent-teams の知見を最新に保つ。"
argument-hint: "[バージョン番号 or 'full']"
user_invocable: true
---

# /wd-cc-tracker — Claude Code 機能トラッカー

Claude Code の最新 changelog を読み、ワードローブの運用に影響する変更を検出して knowhow を更新する。

## 対象領域

以下の5領域を重点的に追跡する:

1. **hooks** — イベント追加・if条件・環境変数・出力フォーマット
2. **subagents** — frontmatter フィールド・memory・mcpServers・isolation
3. **skills** — SKILL.md 形式・context:fork・動的注入・paths
4. **MCP** — サーバータイプ・環境変数展開・headersHelper・パーミッション
5. **agent-teams** — チーム機能・タスク管理・通信

## 実行手順

### Step 1: 既存 knowhow の読み込み

`docs/knowhow/claude-code/` 配下の全ファイルを読む。各ファイルの「出典」行から前回の取得日を確認する。

### Step 2: changelog の取得

WebFetch で Claude Code の changelog を取得する:

```
https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
```

- 引数なし → 最新3バージョン分をチェック
- バージョン番号指定 → そのバージョン以降をチェック
- `full` → 全バージョンをチェック（重い）

### Step 3: 変更の分類

changelog の各エントリを5領域に分類する。関係ないエントリ（UI修正、パフォーマンス改善等）はスキップ。

分類基準:
- hooks: "hook", "PreToolUse", "PostToolUse", "SessionStart", "trigger", "matcher"
- subagents: "subagent", "agent", "Agent tool", "isolation", "worktree"
- skills: "skill", "command", "SKILL.md", "/slash", "context: fork"
- MCP: "MCP", "mcp", ".mcp.json", "server", "transport"
- agent-teams: "team", "teammate", "TeamCreate", "task list"

### Step 4: 公式ドキュメントの深掘り

変更が検出された領域について、公式ドキュメントを WebFetch で取得:

| 領域 | URL |
|---|---|
| hooks | https://code.claude.com/docs/en/hooks |
| subagents | https://code.claude.com/docs/en/sub-agents |
| skills | https://code.claude.com/docs/en/skills |
| MCP | https://code.claude.com/docs/en/mcp |
| agent-teams | https://code.claude.com/docs/en/agent-teams |

既存の knowhow と突き合わせ、差分を特定する。

### Step 5: knowhow の更新

差分がある領域の knowhow ファイルを更新する:
- 出典の日付を更新
- 新しいイベント・フィールド・機能を追加
- 廃止された機能に注記
- 「ワードローブ固有のメモ」に影響分析を追記

### Step 6: ワードローブへの影響評価

更新した knowhow から、ワードローブの既存実装に影響がないか確認する:

- **settings.json** — 新しいフックイベントやフィールドを使えるか
- **スキル** — 新しい frontmatter フィールドで改善できるか
- **サブエージェント** — 新しい機能（memory, mcpServers 等）を活用できるか
- **.mcp.json** — 新しいサーバータイプや設定方法があるか

影響がある場合は具体的な改善提案を出力に含める。

### Step 7: レポート

以下の形式でレポートする:

```
## cc-tracker レポート（YYYY-MM-DD）

### チェック範囲
- changelog: vX.X.X 〜 vY.Y.Y
- 公式ドキュメント: [取得した領域]

### 検出された変更
| 領域 | バージョン | 変更内容 | ワードローブへの影響 |
|---|---|---|---|

### knowhow 更新
- [更新したファイル一覧]

### ワードローブ改善提案
- [具体的なアクション]
```

入力: $ARGUMENTS
