# 読書・知識 (reading-knowledge) — 外部コンテンツの取得と知見管理

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「外部コンテンツの読み取りと知識の蓄積」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| スキル | wd-read | Web ページをリーダーモードで1ページずつ読み、感想を書く |
| スキル | wd-slide-watch | スライド（PDF）を聴衆として1ページずつ体験する |
| スキル | wd-knowhow | 知見を docs/knowhow/ に記録。重複チェック・統合・自己ブラッシュアップ |
| スキル | wd-knowhow-index | docs/knowhow/ のインデックス参照・再構築 |
| スキル | wd-knowhow-filter | タスク内容から関連ノウハウを検索して返す |
| スクリプト | reader.ts | URL を取得し段落単位で分割表示。wd-read の実行エンジン |
| スキル | sanitize | 外部コンテンツの不可視文字を検出・除去 |

## 設計思想

- wd-read は「じっくり読む」道具。WebFetch と違い AI 要約を挟まず、生テキストを段落単位で返す
- wd-slide-watch は「体験する」道具。スライドを先の展開を知らない状態で1ページずつ観る
- knowhow 系は「知識棚」。memory-mcp が日記・エピソード（時系列の記録）なのに対し、knowhow は「最新の正解だけ残す」参照用の知識ベース
- sanitize は外部コンテンツを読む前の安全弁。不可視文字によるプロンプトインジェクションを防ぐ

## 主要フロー

```
[読書]
/wd-read <URL> → reader.ts --info → ページ数確認
  → reader.ts --page 1 → 段落テキスト → 立ち止まって感想
  → reader.ts --page 2 → ... → 全ページ読了 → 総合感想

[スライド体験]
/wd-slide-watch <PDF> → Step 0: PDF→MD変換
  → Pass 1: カラーパレット → Pass 2: テキスト書き起こし → Pass 3: 画像採用
  → Phase 1: 1ページずつ体験 → Phase 2: 感想戦

[知見記録]
発見 → /wd-knowhow → Phase 1: 既存ノウハウ調査 → Phase 2: 記録
  → Phase 3: 自己ブラッシュアップ → Phase 4: wd-knowhow-index reindex

[知見活用]
タスク開始 → /wd-knowhow-filter → INDEX.md 検索 → 関連ノウハウ返却
```

## 関連するシステム

- **記憶**: wd-read で読んだ内容は /wd-remember で記憶に刻める。knowhow は memory-mcp と棲み分け（知識棚 vs 日記）
- **自律行動**: 「読書」欲望が発火すると /wd-read が促される
- **魂・ハーネス**: wd-knowhow-filter はタスク開始時に自動的に関連知見を提供
