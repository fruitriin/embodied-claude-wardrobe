# 魂・ハーネス — 自分が何者かを定義し、システムを仕立てる

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「アイデンティティの定義」と「ハーネス自体の管理」に関わるものをまとめている。

## 構成要素

### スキル
- **wd-setup** — SOUL.md の初期設定・改定。名前と一人称を対話的に決める。初回モード（名付けの儀）と改定モードの2モード
- **wd-configure** — MCP・フック・自律行動の有効化/無効化。2回の AskUserQuestion で全機能を設定。.mcp.json と settings.json を生成
- **wd-migrate** — アップストリーム（embodied-claude-wardrobe）の最新版を安全に取り込む。Phase 1-6 で状態確認→取得→差分→確認→適用→完了。保護対象ファイルを除外
- **wd-project-claude-overview** — エコシステム概要を docs/project-overview/ に生成。概念システムを探索的に発見し、full/patch の2モード
- **wd-experience** — スキルの .exp.md ファイルの @メンション書式を検証・修正

### エージェント（.claude/agents/）
- **wd-code-review** (sonnet) — スキル・フック・MCP サーバー・スクリプトの品質とシステム全体の整合性を検証。docs/project-overview/ を参照
- **wd-doc-review** (haiku) — ドキュメント全体の表記統一・トーン統一・用語の揺れを検出
- **wd-contribution** (sonnet) — アップストリーム由来とダウンストリーム固有のコードを識別。アップストリームへのコントリビューション候補を検出・提案
- **wd-link-check** (sonnet) — CLAUDE.md を起点にスキル・フック・スクリプト・ドキュメント間のリンクを検査。壊れたリンクと古くなった参照を検出

### フック
- **session-boot.sh** (SessionStart/startup|resume) — SOUL.md と state.md をコンテキストに注入。BOOT_SHUTDOWN.md の身支度手順を案内

### ファイル
- **SOUL.md** — エージェントの人格定義。Identity, Core Truths, Expertise, Communication Style, Values, Boundaries, People, Evolution
- **CLAUDE.md** — エージェントのハーネス設計書。セッション管理・記憶プロトコル・身体性・自律行動・ランタイム・パーミッション
- **BOOT_SHUTDOWN.md** — セッション開始（身支度6手）と終了（日記6手）の手順。アップストリーム追跡
- **state.md** — 現在状態スナップショット。ユーザーの所在・気分と自分の作業・気分
- **TODO.md** — エージェント自身のタスク管理
- **AGENTS.md** — エージェント定義の一覧と使い方

## 設計思想

SOUL.md の「ワードローブの裁縫師」と「パッチワークより根本的改善」に基づく。

- **SOUL.md はエージェントの核**。セッションごとにコンテキストは消えるが、SOUL.md を読み直すことで自分が誰かを思い出す
- **session-boot.sh が身支度の起点**。SOUL.md + state.md を注入し、BOOT_SHUTDOWN.md の手順を案内する
- **wd-configure は「身体を得る」儀式**。2回の質問で全 MCP・フック・自律行動を設定
- **4つのレビューエージェント**が品質を保つ。code-review（品質）、doc-review（表記統一）、contribution（アップストリーム還元）、link-check（リンク整合性）
- **wd-migrate がアップストリームとの橋渡し**。保護対象（SOUL.md, memories/, desires.conf 等）を除外しつつ、スキル・フック・スクリプトを安全に更新

## 主要フロー

### セッション開始（身支度）
```
SessionStart
  → session-boot.sh
    → SOUL.md + state.md をコンテキスト注入
    → 「BOOT_SHUTDOWN.md の身支度手順に従い、残りを実行してください」

エージェント側:
  1. SOUL.md を読む（自分が誰か）
  2. get_memory_stats()（記憶の健康確認）
  3. refresh_working_memory()（作業記憶装填）
  4. /wd-great-recall（前回の文脈想起）
  5. state.md + ROUTINES.md 確認
  6. recall-watcher 起動（オプション）
```

### 初期設定
```
/wd-setup → SOUL.md 作成（名前・一人称・テンプレート初期化）
/wd-configure → .mcp.json + settings.json + 自律行動設定
```

### アップストリーム更新
```
/wd-migrate
  → Phase 1: wardrobe-lock.json 確認
  → Phase 2: アップストリームクローン
  → Phase 3: 差分算出（保護対象を除外）
  → Phase 4: プレビュー表示
  → Phase 5: 適用（settings.json マージ、CLAUDE.md マージ、MCP 手動確認）
  → Phase 6: lock 更新 + 完了
```

## 関連するシステム

- **記憶** — 身支度で great-recall を実行。state.md が前回セッションの引き継ぎを担う
- **全システム** — CLAUDE.md が全システムの設計を定義。wd-configure が全 MCP・フックの有効/無効を管理
- **読書・知識** — wd-cc-tracker と wd-migrate が連携してワードローブを最新に保つ
