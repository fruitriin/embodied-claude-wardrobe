# 読書・知識 — 外部から取り込み、蓄積する

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「外部知識の取得と整理」に関わるものをまとめている。

## 構成要素

### スキル
- **wd-read** — Web ページをリーダーモードで読み取る。Readability ライブラリで本文抽出。AI 要約なしの生テキスト。1ページずつ読み、感情と予測を書く「読書体験」
- **wd-slide-watch** — スライドを聴衆として1ページずつ体験する。PDF → マークダウン変換（sonnet サブエージェント）後、separator モードで逐次体験。[体感][気になる][間] の3要素で反応
- **wd-knowhow** — 再利用可能な知見を docs/knowhow/ に記録。Phase 1（調査）→ Phase 2（記録）→ Phase 3（自己ブラッシュアップ）→ Phase 4（インデックス更新）
- **wd-knowhow-index** — docs/knowhow/INDEX.md の参照と再構築。wardrobe/（アップストリーム還元対象）と Personal の2セクション
- **wd-knowhow-filter** — タスクや計画に関連するノウハウだけをフィルタリングして返す
- **wd-cc-tracker** — Claude Code の changelog と公式ドキュメントを突き合わせ、hooks/subagents/skills/MCP/agent-teams の5領域の変更を knowhow に反映

### スクリプト
- **reader.ts** — Readability + linkedom で Web ページの本文を抽出。`--page N` でページ分割、`--info` でメタ情報のみ、`--sep` でカスタムセパレーター分割

### ファイル
- **docs/knowhow/** — 知見ベース。`wardrobe/`（アップストリーム還元対象）と個人知識
- **docs/knowhow/INDEX.md** — 知見のインデックス。ファイルパス・要約・キーワード

## 設計思想

CLAUDE.md の「読書・外部コンテンツ」と knowhow の記載に基づく。

- **読書は逐次体験**。先のページを見てから感想を書くのは読書ではない。1ページずつ、知らない状態で読む
- **memory-mcp が「日記」なら knowhow は「教科書」**。記憶は追記（全部残す）、知見は上書き（最新が正解）
- **wardrobe/ はアップストリーム還元対象**。ワードローブの設計・運用知見はここに蓄積し、wd-migrate で同期される
- **wd-cc-tracker は知見の鮮度を保つ**。Claude Code の仕様変更を追跡し、古くなった knowhow を更新する

## 主要フロー

### Web 読書
```
/wd-read https://example.com/article
  → reader.ts --info で長さ確認
  → reader.ts --page 1 で1ページ目
  → [感情] [予測] を書く
  → reader.ts --page 2 ...
  → 全ページ読了 → 全体の感想
```

### 知見の記録
```
/wd-knowhow "PreToolUse の reason ベースブロック"
  → Phase 1: docs/knowhow/ の既存ファイルを調査
  → Phase 2: 新規作成 or 既存に統合
  → Phase 3: 再読して正確性・完全性・実用性を検証
  → Phase 4: INDEX.md を更新
```

### Claude Code 追跡
```
/wd-cc-tracker
  → docs/knowhow/claude-code/ の既存知見を読む
  → changelog 取得（最新3バージョン）
  → 5領域に分類
  → 公式ドキュメントと突き合わせ
  → knowhow 更新 + ワードローブへの影響評価
```

## 関連するシステム

- **記憶** — knowhow と memory-mcp の棲み分け。「日記」と「教科書」
- **魂・ハーネス** — wd-cc-tracker が wd-migrate と連携してワードローブを最新に保つ
- **知覚** — wd-slide-watch が reader.ts の separator モードを利用
