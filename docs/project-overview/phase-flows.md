# フェーズ進行スキル一覧

> 毎回の実行時に全スキルをスキャンして自動生成。対象リストは決め打ちしない。
> 検出基準: Phase/Step 番号付き構造、または3ステップ以上の手順フローを持つスキル。
> 生成日: 2026-03-30

## 検出結果: 13本

| スキル | フロー構造 |
|---|---|
| wd-knowhow | Phase 1-4 |
| wd-observe | 初手 → 観察ループ(5-8回) → 覚える → 研ぐ |
| wd-slide-watch | Step 0 + Phase 1-2 |
| wd-configure | Step 0-4 |
| wd-migrate | Phase 1-6 |
| wd-setup | Step 0-4 |
| wd-rebuild-index | Step A-E ループ |
| wd-cc-tracker | Step 1-7 |
| wd-great-recall | Step 0-1 |
| wd-experience | Phase 1-4 |
| wd-project-claude-overview | Step 0-7 |
| wd-read | 手順 1-6 |
| wd-recall | 手順 1-3 |

---

## wd-knowhow

生活の知見や実装知見を docs/knowhow/ に記録する。

#### Phase 1: 調査
既存ファイルを全て読み、関連する既存ノウハウを確認

#### Phase 2: 記録
「わかったこと / やり方 / 気をつけること / 参照」の構造で記録

#### Phase 3: 自己ブラッシュアップ
正確性・完全性・簡潔性・実用性を再読検証

#### Phase 4: インデックス更新
docs/knowhow/INDEX.md を更新

---

## wd-observe

部屋を能動的に観察する。

```
初手: 引数チェック + 最初の一見（look_around）
  ↓
観察ループ (5-8回):
  [見る]    → look_*/see でフレームに捉える（see 最大4回/ブロック）
  [予測する] → カメラを動かす前に予測を言語化
  [思い出す] → recall/search_memories で過去と照合
  ↓
覚える: save_visual_memory（関心1つにつき1回、最大3回）
  ↓
研ぐ: カメラ操作の経験則を更新
```

---

## wd-slide-watch

スライドを聴衆として1ページずつ体験する。

### Step 0: 前処理
PDF → マークダウン変換（sonnet サブエージェント）。3パス: カラーパレット → テキスト書き起こし → 画像採用判定

### Phase 1: 体験（聴衆モード）
1セクションずつ読み、[体感][気になる][間] を書く。先のページは見ない

### Phase 2: 余韻
サプライズ一覧 + 全体の感想

---

## wd-configure

MCP・フック・自律行動の有効化/無効化。

### Step 0: 現状読み取り
.mcp.json, settings.json, 各ディレクトリの存在確認

### Step 1: 記憶と自律神経（AskUserQuestion 1回 / 2問）
Q1: 記憶 MCP + 連動フック, Q2: 自律行動

### Step 2: 発話と聴覚（AskUserQuestion 1回 / 3問）
Q1: 音声, Q2: 視覚, Q3: 身体

### Step 3: ファイル生成・更新
.mcp.json, settings.json, 自律行動ファイル

### Step 4: 完了メッセージ

---

## wd-migrate

アップストリームの最新版を安全に取り込む。

### Phase 1: 状態確認
wardrobe-lock.json + git status

### Phase 2: 最新版取得
git clone --depth=1 → コミット比較

### Phase 3: 差分算出
マイグレーション対象 vs 保護対象の分類

### Phase 4: 変更確認（プレビュー）
NEW/CHANGED/REMOVED/UNCHANGED の分類表示

### Phase 5: 適用
通常ファイル上書き → settings.json マージ → CLAUDE.md マージ → MCP 手動確認

### Phase 6: 完了
wardrobe-lock.json 更新 + レポート

---

## wd-setup

SOUL.md の初期設定・改定。

### Step 0: モード判定
初回（SOUL.md なし）or 改定（名前あり）

### Step 1: イントロ
初回: ニュートラルな語り / 改定: 現在の要約

### Step 2: 名付け
AskUserQuestion 1回（名前 + 一人称）

### Step 3: SOUL.md 生成・更新
テンプレートからコピー or 該当フィールド更新

### Step 4: 完了メッセージ
次の道（/wd-setup 再実行 or /wd-configure）を提示

---

## wd-rebuild-index

FLASH.md を記憶 DB から再構築（サブエージェント実行）。

### Step A: 10件読む
bun:sqlite で memories を OFFSET 10件ずつ取得

### Step B: 1件ずつ判断
索引に残す / スキップ / 既存エントリを補強

### Step C: FLASH.md に書き出す
10件の判断結果をまとめて Edit

### Step D: 粒度チェック
search_memories で引けるか検証

### Step E: OFFSET += 10 → Step A に戻る

---

## wd-cc-tracker

Claude Code の最新変更を追跡し knowhow に反映。

### Step 1: 既存 knowhow 読み込み
### Step 2: changelog 取得（WebFetch）
### Step 3: 変更の分類（5領域）
### Step 4: 公式ドキュメント深掘り（WebFetch）
### Step 5: knowhow 更新
### Step 6: ワードローブへの影響評価
### Step 7: レポート

---

## wd-great-recall

多軸想起。同じ記憶群に異なる観点を当てる。

### Step 0: メタ圧縮器
キーワードパターンから起動する軸を選択（技術的/感情的/因果的）

### Step 1: 圧縮器サブエージェント起動（並列、haiku）
選択された軸ごとに recall + 特化抽出 → 結果統合

---

## wd-experience

スキルの .exp.md ファイルの @メンション書式を検証・修正。

### Phase 1: スキャン
.claude/commands/ の全 .md から .exp.md 参照を抽出

### Phase 2: 判定
展開すべき / リテラルで正しい / 変更不要を分類

### Phase 3: 修正
クオートを外す

### Phase 4: 検証
再スキャンで意図しない変更がないことを確認

---

## wd-project-claude-overview

エコシステム概要を docs/project-overview/ に生成。

### Step 0: 前回の経験を読む
### Step 1: 全データ収集（並列）
### Step 2: フェーズフロー自動検出
### Step 3: 概念システムの探索的発見
### Step 4: ドキュメント生成
### Step 5: 経験の記録
### Step 6: .lock 更新
### Step 7: 完了報告

---

## wd-read

Web ページをリーダーモードで読む。

1. URL を抽出
2. `--info` で長さ確認
3. `--page N` で1ページずつ取得
4. 1ページごとに立ち止まり、感情・予測を書く
5. 次のページで予測との差分に反応
6. 全ページ読了後、全体の感想

---

## wd-recall

FLASH.md を地図にして記憶を掘り起こす。

1. サブエージェント起動（haiku）: FLASH.md → search_memories / bun:sqlite
2. 結果を受け取り、会話文脈に合わせて返す
3. 引けなかった場合は正直に返し、別キーワードを提案
