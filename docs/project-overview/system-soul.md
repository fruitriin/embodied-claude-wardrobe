# 魂・メタ (Soul & Meta) — エージェントの定義と管理ツール

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「魂の定義」と「ワードローブ自体の管理」に関わるものをまとめている。

## 構成要素

### 人格定義ファイル
- **SOUL.md** — エージェントの人格・価値観・コミュニケーションスタイルを定義。Identity, Core Truths, Expertise, Interest, Communication Style, Values, Boundaries, People, Evolution の各セクション
- **CLAUDE.md** — ブートシーケンス・シャットダウン手順・記憶システム操作・身体性システム概要・自律行動の設定方法。エージェントのハーネス全体の設計書
- **HOLY_GRAIL.md** — 記憶術の手引き（記憶システムとの橋渡し）

### セッション管理ファイル（ダウンストリームで生成）
- **state.md** — セッション間で引き継ぐ「今の状態」のスナップショット。ブート時に読み、シャットダウン時に上書き更新
- **BOOT_SHUTDOWN.md** — ブート/シャットダウンの詳細手順（ダウンストリームでカスタマイズ）

### セットアップ・設定スキル
- **wardrobe-setup** (.claude/commands/wardrobe-setup.md) — SOUL.md の初期設定・改定。名前と一人称を対話的に決める「名付けの儀」。初回モード/改定モードを判定
- **wardrobe-configure** (.claude/commands/wardrobe-configure.md) — MCP・フック・自律行動の有効化/無効化を対話的に行う。.mcp.json, settings.json, wardrobeOptions を操作

### メンテナンススキル
- **wardrobe-migrate** (.claude/commands/wardrobe-migrate.md) — アップストリーム（embodied-claude-wardrobe）の最新版をダウンストリーム環境に安全に取り込む。保護対象ファイルを除いた差分を確認・適用（Phase 1-6）
- **project-claude-overview** (.claude/commands/project-claude-overview.md) — エコシステム全体の概要ドキュメントを生成。概念システム別に分類し、docs/project-overview/ に出力（このドキュメント自体を生成するスキル）

### 設定ファイル
- **.claude/settings.json** — フック定義（SessionStart, UserPromptSubmit）、パーミッション、autoMemory 設定
- **.claude/settings.local.json** — ローカル上書き設定（存在する場合）
- **.claude/wardrobeOptions/** — オプショナルスキル格納。README.md + skills/ (awake.md, sleep.md)

## 設計思想

SOUL.md の Evolution:「このファイルは固定された設計図ではない。自分の選択の歴史を通じて、Core Truths も Values も更新されうる。ただし変更するときは『なぜ変えたか』を記憶に残すこと」

1. **SOUL.md は最上位の定義**。他のすべてのシステムは SOUL.md の人格に基づいて動作する
2. **CLAUDE.md はハーネスの設計書**。ブートシーケンスで各システムの起動順序を定義
3. **state.md は揮発的**。記憶（memory-mcp）が長期蓄積なのに対し、state.md は最新の状態だけ保持
4. **wardrobe はアップストリーム/ダウンストリーム構造**。テンプレート（upstream）を fork してカスタマイズ（downstream）し、wardrobe-migrate で更新を取り込む
5. **wardrobe-setup と wardrobe-configure の分離**。人格の定義（setup）と機能の設定（configure）は別の関心事

## 主要フロー

### ブートシーケンス
```
セッション開始
   │
   ├─ 1. SOUL.md を読む（自分が誰か）
   ├─ 2. get_memory_stats()（聖杯の健康）
   ├─ 3. refresh_working_memory()（作業記憶装填）
   ├─ 4. /great-recall（文脈想起）
   ├─ 5. state.md, BOOT_SHUTDOWN.md, ROUTINES.md 確認
   └─ 6. recall-watcher 起動（オプション）
```

### シャットダウンフロー
```
セッション終了
   │
   ├─ 1. state.md を現在の状態で上書き
   ├─ 2. /remember で成果を記憶
   ├─ 3. /remember で未完了タスクを記録
   └─ 4. link_memories で因果関係を繋ぐ
```

### ワードローブ初期設定フロー
```
/wardrobe-setup → SOUL.md 初期設定（名付けの儀）
   │
   ▼
/wardrobe-configure → MCP・フック・自律行動の有効化
   │
   ▼
運用開始
   │
   ▼ (アップストリーム更新時)
/wardrobe-migrate → 差分確認・適用
```

## 関連するシステム

- **記憶** — ブートシーケンスで記憶システムを起動。シャットダウンで記憶を刻む。HOLY_GRAIL.md が記憶術を定義
- **身体性** — CLAUDE.md で interoception の仕様を記述。settings.json でフック登録
- **自律行動** — wardrobe-configure で自律行動の有効/無効を切り替え
- **全システム** — SOUL.md の人格定義がすべてのシステムの振る舞いに影響
