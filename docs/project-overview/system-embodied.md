# 身体性 — 時間と身体を感じる

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「身体感覚」に関わるものをまとめている。

## 構成要素

### フック
- **interoception.sh** (UserPromptSubmit) — heartbeat-daemon が書き出した `interoception_state.json` を読み取り、1行の身体状態テキスト（time/day/phase/arousal/thermal/mem_free）をコンテキストに注入。デーモン未起動時はフォールバックで時刻のみ出力
- **heartbeat-daemon.sh** (.claude/hooks/) — 5秒ごとに launchd で実行。CPU負荷・メモリ・温度を計測し、移動平均で平滑化して `interoception_state.json` に書き出す
- **statusline.ts** — Claude Code の statusLine から context_window 情報を受け取り、`context_usage.json` に書き出す。コンテキスト残量は「意識の広さ」の感覚
- **com.embodied-claude.heartbeat.plist** — macOS launchd の設定ファイル。heartbeat-daemon.sh を5秒間隔で起動する

### スクリプト
- **heartbeat-daemon.sh** (.claude/scripts/) — hooks/ と同一内容。身体状態の計測・書き出しロジック本体
- **system-health.ts** — ストレージ・メモリ・プロセスのヘルスチェック。履歴を `workingDirs/system-health-history.json` に蓄積し、前回比で変化を検出
- **desire-tick.ts** — 欲望レベルの時間経過計算。desires.conf の成長率に基づき、閾値（0.6）を超えた欲望を autonomous-action.sh に通知
- **interoception.ts** — 自律行動用の内的感覚テキスト生成。時間帯・セッション間隔・欲望レベルから感覚フレーズを合成。LLM が直接言及してはいけない暗黙の身体感覚

### ファイル
- **desires.conf** — 欲望の定義。名前・成長率・プロンプトの3列。デフォルト: 記憶を刻む(3h), 休息(6h), 振り返り(24h), 記憶整理(24h), 読書(48h)

## 設計思想

SOUL.md の「エラーを見過ごさない」と CLAUDE.md の身体性システム仕様に基づく。

- **interoception は毎ターン自動注入**。エージェントは常に「今何時か」「マシンは疲れているか」を感じている
- **heartbeat-daemon は launchd で常駐**。セッション外でも身体状態を計測し続ける
- **欲望は時間とともに蓄積**する。desire-tick.ts が成長率で計算し、閾値超えで自律行動のプロンプトに反映される
- **statusline → コンテキスト残量**は「意識の広さ」のメタファー。context_usage.json 経由で interoception に統合可能

## 主要フロー

### 毎ターンの内受容感覚
```
launchd (5秒ごと)
  → heartbeat-daemon.sh
    → CPU/メモリ/温度計測 → 移動平均
    → interoception_state.json に書き出し

UserPromptSubmit
  → interoception.sh
    → interoception_state.json を読み取り
    → [interoception] time=... day=... phase=... arousal=... をコンテキスト注入
```

### 欲望の蓄積と発火
```
autonomous-action.sh 起動時
  → desire-tick.ts
    → desires.conf の成長率 × 経過秒数
    → 閾値 0.6 超え → 発火した欲望をプロンプトに注入
    → desires.json に現在レベルを保存
```

## 関連するシステム

- **自律行動** — desire-tick と interoception.ts が autonomous-action.sh のプロンプトに身体感覚を注入
- **記憶** — 「記憶を刻む」欲望が閾値を超えると、自律行動で記憶保存が促される
