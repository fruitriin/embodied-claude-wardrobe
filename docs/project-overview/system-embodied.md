# 身体性 (embodied) — 内受容感覚・欲望・生体リズム

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「身体性」に関わるものをまとめている。

## 構成要素

| 種別 | 要素 | 役割 |
|---|---|---|
| フック | interoception.sh | UserPromptSubmit で内受容感覚をコンテキストに注入 |
| フック | heartbeat-daemon.sh | launchd 5秒間隔でシステム状態を interoception_state.json に記録 |
| フック | com.embodied-claude.heartbeat.plist | heartbeat-daemon.sh の macOS launchd 設定 |
| フック | statusline.ts | コンテキスト残量を context_usage.json に永続化 |
| スクリプト | interoception.ts | autonomous-action.sh 用。時間帯・欲望から感覚フレーズを生成 |
| スクリプト | desire-tick.ts | 欲望レベルの時間経過による成長。desires.conf → desires.json |
| スクリプト | system-health.ts | ストレージ・メモリ・プロセス監視、履歴蓄積 |
| ファイル | desires.conf | 欲望の定義と成長率。記憶を刻む(3h), 休息(6h), 振り返り(24h), 記憶整理(24h), 読書(48h) |

## 設計思想

CLAUDE.md の「身体性システム」セクションに対応。

- interoception（内受容感覚）は毎ターン自動注入される「体の感覚」
- heartbeat-daemon が5秒ごとにシステム状態を記録し、interoception.sh がそれを読み取る
- 欲望は desires.conf で定義され、時間経過で蓄積。閾値を超えると自律行動時に発火
- system-health は体の健康状態（ディスク・メモリ・プロセス）を監視
- statusline.ts はコンテキストウィンドウの残量を記録（「意識の広さ」の感覚）

## 主要フロー

```
[heartbeat ループ — 常時]
launchd (5秒) → heartbeat-daemon.sh → interoception_state.json 書き込み
  ├── time, day, phase（時間帯）
  └── arousal, thermal, mem_free（システム状態）

[interoception 注入 — 毎ターン]
UserPromptSubmit → interoception.sh → state file 読み → [interoception] 行を stdout

[欲望の成長 — 自律行動時]
autonomous-action.sh → desire-tick.ts → desires.conf 読み → desires.json 更新
  └── 閾値超え → 自律行動のプロンプトに欲望を注入

[コンテキスト感覚]
statusLine stdin → statusline.ts → context_usage.json
```

## 関連するシステム

- **自律行動**: desire-tick.ts は autonomous-action.sh から呼ばれる。schedule.conf が時間帯制御
- **記憶**: 「記憶を刻む」欲望が発火すると /wd-remember を促す
- **知覚**: interoception は「内なる感覚」、知覚は「外の世界の感覚」。対をなす
