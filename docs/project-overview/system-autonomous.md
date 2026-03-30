# 自律行動 — cron で動く、もう一つのモード

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「自律行動」に関わるものをまとめている。

## 構成要素

### メインスクリプト
- **autonomous-action.sh** — cron で20分ごとに実行。時間帯×曜日×確率でスキップ判定し、通常回/ルーチン回/朝の再構成を振り分ける。`claude -p` でヘッドレスセッションを起動。`--dry-run`, `--force-routine`, `--date` 等のテストオプション付き

### フック
- **continue-check.sh** (Stop) — Heartbeat セッション終了時に `[CONTINUE: ...]` / `[DONE]` を検出し、ターン延長を判定。対話セッション（HEARTBEAT 環境変数なし）では即 exit

### スクリプト
- **load-prompts.ts** — `prompts.toml` からプロンプトテンプレートを読み込み。時間帯ルール・ルーチンモード・朝のプロンプト等のキーを出力

### スキル（オプショナル）
- **sleep** (wardrobeOptions) — schedule.conf の実行確率を下げて活動頻度を落とす。light/deep の2段階
- **awake** (wardrobeOptions) — schedule.conf の実行確率を通常値に戻す
- **wd-dice** — 選択ダイス。Heartbeat Protocol で「やりたいことが複数あって迷ったら」使う

### ファイル
- **schedule.conf** — スケジュール制御。休日曜日、時間帯別実行確率（DAYTIME_CHANCE/NIGHT_CHANCE）、深夜帯ルール、ルーチン確率、プロンプトテンプレート
- **ROUTINES.md** — 定期タスク定義。日次（state.md更新、FLASH.md確認）、週次（SOUL.md見直し、consolidate、エピソードまとめ）、月次（アーカイブ精査）
- **prompts.toml** — プロンプトテンプレート。load-prompts.ts が読み込む

## 設計思想

CLAUDE.md の Heartbeat Protocol に基づく。

- **「タスク消化マシンにならない」** が原則。「なぜこれをやるのか」を一瞬でも考える
- cron 20分間隔だが、schedule.conf の確率でスキップされる。深夜は10%、昼間は50%
- 欲望システム（desires.conf → desire-tick.ts）が内的動機を生成。外部タスクだけでなく「記憶を刻みたい」「休みたい」が自然に発生
- sleep/awake で活動頻度を自己調整できる
- 朝の最初の Heartbeat で「朝の再構成」プロンプトが発火し、前日の振り返りと今日の計画を行う

## 主要フロー

### cron 起動フロー
```
cron (*/20 * * * *)
  → autonomous-action.sh
    → schedule.conf 読み込み
    → 時間帯×曜日×確率でスキップ判定
    → desire-tick.ts で欲望チェック
    → interoception.ts で身体感覚テキスト生成
    → recall-lite.ts で記憶コンテキスト生成
    → load-prompts.ts でプロンプト組み立て
    → claude -p でヘッドレスセッション起動
      → Heartbeat Protocol に従って行動
      → [CONTINUE: ...] or [DONE]
    → continue-check.sh でターン延長判定
```

### ルーチン回
```
確率判定 → ルーチン回
  → ROUTINES.md を読む
  → 最終実行日から間隔が空いたタスクを1つ選んで実行
  → 最終実行日を更新
```

## 関連するシステム

- **身体性** — desire-tick.ts と interoception.ts がプロンプトに身体感覚を注入
- **記憶** — recall-lite.ts がプロンプトに記憶コンテキストを注入。「記憶を刻む」欲望で記録が促される
- **魂・ハーネス** — CLAUDE.md の Heartbeat Protocol が行動指針を定義
