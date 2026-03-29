# Claude Code Skills — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/skills (2026-03-29 取得)

## 概要

スキルは Claude の能力を拡張する Markdown ファイル。`.claude/skills/<name>/SKILL.md` に配置。
旧 `.claude/commands/*.md` も引き続き動作するが、skills が推奨。同名の場合 skills が優先。

## ディレクトリ構造

```
my-skill/
├── SKILL.md           # メイン（必須）
├── template.md        # テンプレート
├── examples/
│   └── sample.md      # 出力例
└── scripts/
    └── validate.sh    # 実行スクリプト
```

## frontmatter フィールド

| フィールド | 必須 | 説明 |
|---|---|---|
| name | No | 表示名。省略時はディレクトリ名 |
| description | 推奨 | 用途説明（250文字でtruncate） |
| argument-hint | No | 引数ヒント（例: `[issue-number]`） |
| disable-model-invocation | No | true で Claude の自動呼び出しを禁止 |
| user-invocable | No | false で `/` メニューから非表示 |
| allowed-tools | No | スキル実行中に使えるツール |
| model | No | 使用モデル |
| effort | No | low, medium, high, max |
| context | No | `fork` でサブエージェントで実行 |
| agent | No | context: fork 時のエージェント型 |
| hooks | No | スキルのライフサイクルフック |
| paths | No | ファイルパターンで自動有効化 |
| shell | No | bash（デフォルト）or powershell |

## 変数展開

| 変数 | 説明 |
|---|---|
| `$ARGUMENTS` | スキル呼び出し時の引数全体 |
| `$ARGUMENTS[N]` / `$N` | N番目の引数（0-based） |
| `${CLAUDE_SESSION_ID}` | セッション ID |
| `${CLAUDE_SKILL_DIR}` | SKILL.md のあるディレクトリ |

## 動的コンテキスト注入

`` !`command` `` 構文でシェルコマンドを事前実行し、出力をスキル内容に埋め込む。

```yaml
## PR context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
```

## context: fork（サブエージェントでの実行）

スキルの内容がサブエージェントのタスクになる。メイン会話の履歴は引き継がれない。

```yaml
context: fork
agent: Explore
```

## 呼び出し制御

| 設定 | ユーザー | Claude | コンテキストへの読み込み |
|---|---|---|---|
| デフォルト | Yes | Yes | description 常時、全文は呼び出し時 |
| disable-model-invocation: true | Yes | No | description なし、全文はユーザー呼び出し時 |
| user-invocable: false | No | Yes | description 常時、全文は呼び出し時 |

## 配置場所

| レベル | パス | スコープ |
|---|---|---|
| Enterprise | managed settings | 全ユーザー |
| Personal | `~/.claude/skills/<name>/SKILL.md` | 全プロジェクト |
| Project | `.claude/skills/<name>/SKILL.md` | このプロジェクト |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | プラグイン有効時 |

## バンドルスキル

| スキル | 用途 |
|---|---|
| /batch | 大規模並列変更。ワークツリーで並列エージェント起動 |
| /claude-api | Claude API リファレンス |
| /debug | デバッグログ有効化 |
| /loop | プロンプトを定期的に実行 |
| /simplify | 変更ファイルのレビュー+修正（3並列エージェント） |

## ワードローブ固有のメモ

- ワードローブのスキルは `.claude/commands/*.md` に配置（旧形式）。skills/ への移行を検討
- SKILL.md のサポートファイル機能で、大きなリファレンスを別ファイルに分離できる
- `context: fork` + `agent: Explore` で knowhow-filter を効率化できる可能性
- `paths` フィールドでファイルパターンに応じた自動スキル有効化が可能
- description の250文字 truncate に注意。キーワードを冒頭に
- `!`command`` 構文で git 情報等を動的にスキルに埋め込める
