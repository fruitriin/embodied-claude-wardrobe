# desire-system の処遇

> desire-system/ はプロジェクトルートに残った旧世代の欲望 MCP サーバー。

## 比較結果

| | desire-system (MCP) | desire-tick.ts (スクリプト) |
|---|---|---|
| 蓄積ロジック | 記憶ベース逆算（毎回 search） | 時間ベース線形加算（tick ごと） |
| コスト | 重い（記憶検索） | 軽い（ファイル読み書きのみ） |
| 依存 | chromadb（旧世代、SQLite 移行済み） | Bun + desires.conf |
| カスタマイズ | ハードコード（4 種固定） | desires.conf で自由に定義 |
| 発火方式 | エージェントが能動的に get_desires を呼ぶ | autonomous-action.sh から tick で自動注入 |

## 判断

**desire-tick で十分。desire-system は統合しない。**

- tick の加算 + satisfy のリセットが軽量かつ確実
- 記憶ベース逆算のメリット（satisfy 呼び忘れ補正）は、autonomous-action.sh で satisfy を確実に呼ぶ設計で代替可能
- chromadb 依存を SQLite に書き換えるコストに見合わない

## アクション

- [x] desire-system/ を削除（chromadb 依存の旧世代、desire-tick.ts で代替済み）
- [x] README.md の MCP 一覧・Requirements から削除
- [x] AGENTS.md の記述から削除
