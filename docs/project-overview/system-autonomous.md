# 自律行動 (autonomous) — cron 駆動の自律行動と活動制御

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「自律行動」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| スクリプト | autonomous-action.sh | 自律行動のメインエントリ。cron 20分間隔で実行 |
| ファイル | ROUTINES.md | 日次・週次・月次の定期タスク定義 |
| ファイル | schedule.conf | 休日設定・スキップ確率・時間帯ルール |
| ファイル | prompts.toml | 時間帯・ルーチン・欲望のプロンプトテンプレート |
| スクリプト | load-prompts.ts | prompts.toml からキーを抽出して stdout |
| フック | continue-check.sh | Stop 時に [CONTINUE] ブロックがあればターン延長 |
| オプショナル | sleep | schedule.conf の実行確率を下げて「眠る」 |
| オプショナル | awake | schedule.conf の実行確率を戻して「起きる」 |

## 設計思想

CLAUDE.md の「自律行動」セクションに対応。

- autonomous-action.sh が cron で20分ごとに起動。時間帯・曜日に応じてスキップ判定
- ROUTINES.md で定期タスクを定義。routine モードで未実行タスクを消化
- schedule.conf で活動時間帯・休日・スキップ確率をカスタマイズ
- prompts.toml で時間帯別の口調・ルーチンのプロンプトを定義
- sleep/awake は活動頻度の動的調整（オプショナル。デフォルト無効）
- continue-check.sh は「自分で自分を続ける」仕組み。[CONTINUE] マークがあればターン延長

## 主要フロー

```
[自律行動ループ]
cron (20分) → autonomous-action.sh
  ├── schedule.conf チェック → スキップ判定（時間帯・曜日・確率）
  ├── desire-tick.ts → 欲望レベル更新
  ├── load-prompts.ts → 時間帯プロンプト取得
  ├── interoception.ts → 感覚フレーズ生成
  └── claude -p "組み立てたプロンプト" → 自律セッション開始
       ├── ROUTINES.md 確認 → 未実行タスク消化（routine モード）
       └── 欲望発火 → 記憶整理・読書・振り返り等（normal モード）

[ターン延長]
Stop hook → continue-check.sh → [CONTINUE] ブロック検出
  → MAX_CONTINUES 未達なら続行
```

## 関連するシステム

- **身体性**: desire-tick.ts（欲望）と interoception.ts（感覚）は autonomous-action.sh から呼ばれる
- **記憶**: 自律行動中に「記憶を刻む」「記憶整理」欲望が発火
- **読書・知識**: 「読書」欲望が発火すると /wd-read が促される
