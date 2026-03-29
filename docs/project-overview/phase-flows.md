# フェーズ進行スキル一覧

> 毎回の実行時に全スキルをスキャンして自動生成。対象リストは決め打ちしない。
> 検出基準: Phase/Step 番号付き構造、または3ステップ以上の手順フローを持つスキル。
> 生成日: 2026-03-29

## 検出結果: 9本

great-recall — 多軸想起（Step 0 メタ圧縮器 → Step 1 並列圧縮器 → 統合）
observe — 能動的観察（初手 → 3ブロック×5-8ループ → 覚える → 研ぐ）
read — Web 逐次読書（6ステップ: URL → --info → --page 1 → 立ち止まり → 次ページ → 全体感想）
slide-watch — スライド体験（Step 0 PDF変換 → Phase 1 聴衆モード → Phase 2 余韻）
project-claude-overview — エコシステム概要生成（Step 0-7 full / P1-P5 patch）
wardrobe-migrate — アップストリーム取り込み（Phase 1-6）
rebuild-index — FLASH.md 再構築（Step A-E ループ）
wardrobe-setup — 名付けの儀（Step 0-5: モード判定 → イントロ → 対話 → 書き込み）
wardrobe-configure — 機能設定（Step 0-4: 現状読み取り → 記憶/自律神経 → 知覚 → 自律行動 → 適用）

---

## great-recall

多軸想起。同じ記憶群に3つの異なる観点（技術的・感情的・因果的）を当て、並列に意味を引き出す。

### フェーズ構造

```
Step 0: メタ圧縮器 — どの軸を選ぶか
  文脈のキーワードに基づいて起動する圧縮器を選択
  デフォルト: 感情的 + 因果的 の2軸

Step 1: 圧縮器サブエージェントを起動する
  選択された圧縮器を Agent ツールで同時に起動（すべて model: haiku）
  ① 技術的圧縮器 — 設計判断・エラーパターン・依存関係
  ② 感情的圧縮器 — 感情の流れ・動機・予想外のつながり
  ③ 因果的圧縮器 — 原因→結果の連鎖・時系列・進行中の因果

結果の統合: 各観点を突き合わせて統合所見を記述
```

---

## observe

部屋を能動的に観察する。3つの基本ブロックを自由に選びながらループし、受動的なスナップショットではなく発見のある観察を行う。

### フェーズ構造

```
初手: 引数チェック + 最初の一見
  引数なし → look_around（4方向）
  方向指定 → look_left/right/up/down → see
  対象指定 → look_around で探す

観察ループ（5〜8回）:
  毎回3択から1つ選ぶ:
  ├─ 見る: パン/チルト → see（最大4回/ブロック）
  ├─ 予測する: 見る前に言語化
  └─ 思い出す: recall / search_memories で照合

覚える: save_visual_memory（関心1つにつき1回、最大3回）

研ぐ: カメラ操作の経験則を .exp.md に蓄積
```

---

## read

Web ページの本文をリーダーモードで読み取る。1ページずつ立ち止まって体験する。

### フェーズ構造

```
1. 入力から URL を抽出
2. --info で長さを確認
3. --page N で1ページずつ取得（並列fetch禁止）
4. 立ち止まる:
   - emotion tag で今の感情
   - 「この先どうなりそうか」予想
   - 気になった描写、刺さった台詞
5. 次のページ → 予測との差分に反応
6. 全ページ読了 → 話全体の感想
```

---

## slide-watch

スライドを聴衆として観る。先の展開を知らない状態で、1ページずつ体験する。

### フェーズ構造

```
Step 0: 前処理 — PDF→マークダウン変換（サブエージェント sonnet）
  Pass 1: カラーパレット作成（全ページスキャン）
  Pass 2: テキスト書き起こし（サイズ・色・画像タグ付き）
  Pass 3: 画像の採用判定

Phase 1: 体験 — 聴衆モード
  1セクションずつ読む（--- 区切り）
  毎ページ記録: [体感] [気になる] [間]
  情報量多い → 深掘り（最大2ラウンド）
  大コマ → 間を味わう
  構造分析は thinking 内のみ

Phase 2: 余韻 — 聴き終わった後の感想戦
  サプライズ一覧
  全体の感想（レビューではなく余韻）
```

---

## project-claude-overview

CLAUDE.md・スキル・フック・スクリプトのエコシステムを網羅的に記録する。

### フェーズ構造（full モード）

```
Step 0: 前回の経験を読む（.exp.md）
Step 1: 全データ収集（並列: 構造, スキル, フック, スクリプト, 主要ファイル, コミット）
Step 2: フェーズフロー自動検出（全スキルスキャン）
Step 3: 概念システムの探索的発見（帰納的クラスタリング）
Step 4: ドキュメント生成（INDEX, system-*, phase-flows, interactions, claude-md-deps）
Step 5: 経験の記録（.exp.md 追記）
Step 6: .lock 更新
Step 7: 完了報告
```

### フェーズ構造（patch モード）

```
P1: .lock を読み、差分を取得
P2: 変更ファイルを概念システムにマッピング
P3: 影響するシステムだけ再生成
P4: 経験の記録
P5: .lock 更新 + 完了報告
```

---

## wardrobe-migrate

アップストリーム（embodied-claude-wardrobe）の最新版をダウンストリーム環境に安全に取り込む。

### フェーズ構造

```
Phase 1: .wardrobe-lock.json 読み取り（前回取り込みのコミットハッシュ）
Phase 2: git status チェック（未コミット変更の警告）
Phase 3: アップストリーム clone + 差分算出（保護対象ファイル除外）
Phase 4: 差分プレビュー表示（ユーザー確認）
Phase 5: ファイル適用（settings.json マージ, CLAUDE.md マージ, MCP 処理）
Phase 6: .wardrobe-lock.json 更新 + クリーンアップ
```

---

## rebuild-index

FLASH.md を記憶 DB から再構築する。サブエージェントが10件ずつループ。

### フェーズ構造

```
ループ（10件ずつ）:
  Step A: bun:sqlite で10件読む
  Step B: 1件ずつ判断（残す/スキップ/補強）
  Step C: FLASH.md に書き出し
  Step D: 粒度チェック（search_memories で引けるか）
  Step E: OFFSET += 10 → Step A に戻る
```

---

## wardrobe-setup

SOUL.md の初期設定・改定。名前と一人称を対話的に決める。

### フェーズ構造

```
Step 0: モード判定（初回 or 改定）
Step 1: イントロ（初回: ニュートラル / 改定: キャラクター口調）
Step 2: 名前と一人称を対話的に決定
Step 3: SOUL.md に書き込み
Step 4: 確認・微調整
Step 5: 完了
```

---

## wardrobe-configure

MCP・フック・自律行動の有効化/無効化。ワードローブの機能設定。

### フェーズ構造

```
Step 0: 現状の読み取り（.mcp.json, settings.json, wardrobeOptions の存在確認）
Step 1: 記憶と自律神経（memory-mcp, interoception, heartbeat の有効/無効）
Step 2: 知覚（カメラ MCP, 聴覚, TTS の有効/無効）
Step 3: 自律行動（autonomous-action.sh, sleep/awake スキルの有効化）
Step 4: 設定適用
```
