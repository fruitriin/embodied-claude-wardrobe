# Claude Code Skills — 最新仕様まとめ

> 出典: https://code.claude.com/docs/en/skills + CHANGELOG 1.0.0〜2.1.87 (2026-03-29 取得)

## 導入・進化の経緯

| バージョン | 変更 |
|---|---|
| 1.0.25 | slash commands のプレフィックス改善 |
| 1.0.30 | bash 出力、@ファイル参照、thinking キーワード対応 |
| 1.0.45 | サブディレクトリのネームスペース復元（frontend:component 形式） |
| 1.0.54 | argument-hint frontmatter 追加 |
| 1.0.57 | model 指定対応 |
| 1.0.123 | SlashCommand ツール追加（Claude がスキルを呼び出せるように） |
| 2.0.20 | Claude Skills リリース（.claude/skills/ ディレクトリ形式） |
| 2.1.0 | context:fork + agent フィールド、hooks frontmatter、ホットリロード、once:true、allowed-tools YAML対応 |
| 2.1.3 | slash commands と skills を統合（同一の仕組み） |
| 2.1.6 | ネストされた .claude/skills/ の自動検出 |
| 2.1.19 | $0, $1 等のショートハンド、argument-hint の bracket 構文 |
| 2.1.32 | skill 文字バジェットがコンテキストウィンドウの2%にスケール |
| 2.1.63 | /simplify, /batch バンドルスキル追加 |
| 2.1.69 | ${CLAUDE_SKILL_DIR} 変数追加 |

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

.claude/commands/*.md も引き続き動作。同名の場合 skills/ が優先。

## frontmatter フィールド

| フィールド | 必須 | 説明 | 追加時期 |
|---|---|---|---|
| name | No | 表示名。省略時はディレクトリ名 | 初期 |
| description | 推奨 | 用途説明（250文字でtruncate） | 初期 |
| argument-hint | No | 引数ヒント | 1.0.54 |
| disable-model-invocation | No | true で Claude の自動呼び出しを禁止 | 不明 |
| user-invocable | No | false で / メニューから非表示 | 不明 |
| allowed-tools | No | スキル実行中に使えるツール（YAML リスト可） | 2.1.0 |
| model | No | 使用モデル | 1.0.57 |
| effort | No | low, medium, high, max | 不明 |
| context | No | `fork` でサブエージェントで実行 | 2.1.0 |
| agent | No | context:fork 時のエージェント型 | 2.1.0 |
| hooks | No | スキルのライフサイクルフック | 2.1.0 |
| paths | No | ファイルパターンで自動有効化 | 不明 |
| shell | No | bash（デフォルト）or powershell | 不明 |

## 変数展開

| 変数 | 説明 | 追加時期 |
|---|---|---|
| $ARGUMENTS | 引数全体 | 初期 |
| $ARGUMENTS[N] / $N | N番目の引数（0-based） | 2.1.19 |
| ${CLAUDE_SESSION_ID} | セッション ID | 2.1.9 |
| ${CLAUDE_SKILL_DIR} | SKILL.md のあるディレクトリ | 2.1.69 |

## 動的コンテキスト注入（1.0.30〜）

`` !`command` `` 構文でシェルコマンドを事前実行し、出力をスキルに埋め込む。

## context:fork（2.1.0〜）

スキル内容がサブエージェントのタスクになる。メイン会話の履歴は引き継がれない。

## バンドルスキル（2.1.63〜）

| スキル | 用途 |
|---|---|
| /batch | 大規模並列変更。ワークツリーで並列エージェント起動 |
| /simplify | 変更ファイルのレビュー+修正（3並列エージェント） |
| /claude-api | Claude API リファレンス (2.1.69〜) |
| /debug | デバッグログ有効化 |
| /loop | プロンプトを定期的に実行 |

## 呼び出し制御

| 設定 | ユーザー | Claude | コンテキスト |
|---|---|---|---|
| デフォルト | Yes | Yes | description 常時、全文は呼び出し時 |
| disable-model-invocation: true | Yes | No | description なし |
| user-invocable: false | No | Yes | description 常時 |

## description の文字バジェット

コンテキストウィンドウの2%（2.1.32〜）。各エントリは250文字で truncate。キーワードを冒頭に置くこと。

## ワードローブ固有のメモ

- ワードローブのスキルは .claude/commands/*.md（旧形式）。.claude/skills/ への移行を検討
- SKILL.md のサポートファイル機能で大きなリファレンスを別ファイルに分離可能
- context:fork + agent:Explore で knowhow-filter を効率化できる可能性
- paths フィールドでファイルパターンに応じた自動スキル有効化が可能
- ${CLAUDE_SKILL_DIR} でスキルディレクトリの絶対パスを取得可能（スクリプト参照に便利）
- `!`command`` 構文で git 情報等を動的にスキルに埋め込める
- /batch はワークツリーで並列エージェントを起動。大規模リファクタに有用
