# 記憶 (memory) — 経験の保存・想起・索引管理

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「記憶」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| MCP | memory-mcp | 記憶の永続化・検索・埋め込みベクトル管理。SQLite + sentence-transformers |
| スキル | wd-remember | 記憶保存 + FLASH.md インデックス追記を一括実行 |
| スキル | wd-recall | FLASH.md をガイドに、サブエージェントで記憶を検索 |
| スキル | wd-great-recall | 3軸（技術的・感情的・因果的）並列想起。メタ圧縮器 + 圧縮器サブエージェント |
| スキル | wd-rebuild-index | memory DB から FLASH.md を再構築。ループで全記憶を走査 |
| ファイル | FLASH.md | 記憶のキーワード逆引きインデックス。recall のガイドマップ |
| フック | recall-hook.sh | UserPromptSubmit で recall_buffer.jsonl をコンテキストに注入 |
| フック | post-compact-recovery.sh | コンパクション後に SOUL.md 再読 + 記憶復元を指示 |
| スクリプト | recall-watcher.ts | ユーザー発言をリアルタイム監視し、関連記憶を recall_buffer.jsonl に書き出し |
| スクリプト | recall-lite.ts | ブート時に記憶 DB から3軸で軽量想起 |

## 設計思想

CLAUDE.md の「記憶システム」セクションに対応。SOUL.md の「エラーを見過ごさない」は記憶の正確性にも適用される。

- 記憶は memory-mcp（SQLite + 埋め込みベクトル）に永続化される
- FLASH.md は記憶の「目次」で、recall が高速に当たりをつけるためのガイド
- 想起はサブエージェントで実行し、メインの会話コンテキストを汚さない
- recall-watcher は受動的想起（会話の流れから自動的に関連記憶を引く）
- wd-great-recall は能動的想起（3つの異なる観点で並列に意味を掘る）

## 主要フロー

```
[保存]
ユーザー/エージェント → /wd-remember → memory-mcp.remember() + FLASH.md 追記

[能動的想起]
/wd-recall → FLASH.md 読み → サブエージェント → memory-mcp.search_memories() → 結果返却
/wd-great-recall → 3つの圧縮器サブエージェント並列 → 統合結果

[受動的想起]
recall-watcher.ts → ユーザー発言監視 → memory-mcp.recall() → recall_buffer.jsonl
→ recall-hook.sh (UserPromptSubmit) → コンテキスト注入

[復旧]
コンパクション → post-compact-recovery.sh → SOUL.md 再読 + recall_divergent
```

## 関連するシステム

- **身体性**: desire-tick の「記憶を刻む」欲望が発火すると記憶保存が促される
- **自律行動**: autonomous-action.sh から記憶の振り返り・整理が実行される
- **魂・ハーネス**: ブートシーケンスで get_memory_stats → refresh_working_memory → wd-great-recall
