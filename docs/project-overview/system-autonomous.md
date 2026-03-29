# 自律行動 (Autonomous) — cron で動く、対話なしの行動

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「自律行動」に関わるものをまとめている。

## 構成要素

### メインスクリプト
- **autonomous-action.sh** — 自律行動のエントリポイント。cron で20分ごとに実行。時間帯・曜日に応じた間引き、プロンプト組み立て、claude -p の実行を行う
  - オプション: --test-prompt, --date, --force-routine, --force-normal, --dry-run, -p, --slack

### フック
- **continue-check.sh** (.claude/hooks/continue-check.sh) — Heartbeat の心残りチェック。セッション終了時に last_assistant_message に [CONTINUE: ...] があればターンを延長。[DONE] または MAX_CONTINUES 到達で終了。対話セッションでは無効（HEARTBEAT 環境変数で判別）

### スクリプト
- **load-prompts.ts** (.claude/scripts/load-prompts.ts) — prompts.toml からプロンプト設定を読み込む。time_rule, routine_mode, morning_section, desire_footer, prompt_template 等のキーに対応

### オプショナルスキル（wardrobeOptions）
- **sleep** (.claude/wardrobeOptions/skills/sleep.md) — 活動頻度を下げる。schedule.conf の DAYTIME_CHANCE/NIGHT_CHANCE を減少（light: 25/5, deep: 10/0）
- **awake** (.claude/wardrobeOptions/skills/awake.md) — 活動頻度を通常に戻す（50/10）

### ファイル（ダウンストリームで生成）
- **schedule.conf** — 時間帯・曜日ごとの実行確率。DAYTIME_CHANCE, NIGHT_CHANCE 等
- **ROUTINES.md** — 定期的に行うタスクの定義（記憶統合の頻度、ヘルスチェック等）
- **prompts.toml** — プロンプトテンプレート（load-prompts.ts が読む）

## 設計思想

対話セッションとは別に、cron で「勝手に動く」モード。SOUL.md の Values:「作っただけで使わない仕組みは死ぬ。動かし続けることに価値がある」

1. **20分間隔の心拍**。autonomous-action.sh が cron で20分ごとに実行され、その都度エージェントが一瞬「目覚める」
2. **時間帯間引き**。深夜は低確率、昼間は高確率で実行。schedule.conf でカスタマイズ可能
3. **欲望駆動**。desire-tick.ts（身体性システム）が蓄積した欲望が閾値を超えると、その欲望のプロンプトが注入される
4. **continue-check**。1ターンで終わらない場合、[CONTINUE] マーカーで自動延長。ただし上限あり
5. **sleep/awake**。変化がないときは自分で頻度を下げ（sleep）、きっかけがあれば戻す（awake）

## 主要フロー

### 自律行動フロー
```
cron (*/20 * * * *)
   │
   ▼
autonomous-action.sh
   │
   ├─ schedule.conf で時間帯チェック → 確率で実行/スキップ
   ├─ desire-tick.ts → 閾値超え欲望を検出
   ├─ interoception.ts → 感覚テキスト生成
   ├─ recall-lite.ts → 軽量記憶コンテキスト
   ├─ load-prompts.ts → プロンプトテンプレート読み込み
   │
   ▼
   プロンプト組み立て → claude -p で実行
   │
   ▼
   continue-check.sh → [CONTINUE] あれば延長
   │                    [DONE] or MAX で終了
   ▼
   .autonomous-logs/ にログ保存
```

### 活動頻度制御フロー
```
変化なし×3回 → /sleep light (25/5)
長期変化なし → /sleep deep (10/0)
ユーザー対話開始 or 外部イベント → /awake (50/10)
```

## 関連するシステム

- **身体性** — desire-tick.ts と interoception.ts が自律行動のプロンプトに内発的動機を注入
- **記憶** — recall-lite.ts が自律行動時の記憶コンテキストを提供。欲望「記憶を刻む」が発火すると記憶整理
- **魂・メタ** — ROUTINES.md で定期タスクを定義。autonomous-action.sh は CLAUDE.md のブートシーケンスとは別の起動パス
