# 身体性 (Embodiment) — 時間感覚・身体感覚・欲望を持つ

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「身体性」に関わるものをまとめている。

## 構成要素

### フック
- **heartbeat-daemon.sh** (.claude/hooks/heartbeat-daemon.sh) — 心拍デーモン。5秒ごとに launchd で実行され、CPU・メモリ・温度・時間帯を interoception_state.json に書き出す
- **interoception.sh** (.claude/hooks/interoception.sh) — UserPromptSubmit で発火。heartbeat-daemon が書き出した state file を読んで1行の内受容感覚テキストとしてコンテキストに注入（time, day, date, phase, arousal, thermal, mem_free）
- **statusline.ts** (.claude/hooks/statusline.ts) — ステータスライン表示 + context_window 情報を context_usage.json に永続化。interoception.sh から参照可能
- **com.embodied-claude.heartbeat.plist** (.claude/hooks/) — macOS launchd 設定。heartbeat-daemon.sh を5秒間隔で起動する定義

### スクリプト
- **desire-tick.ts** (.claude/scripts/desire-tick.ts) — 欲望蓄積。desires.conf から欲望定義を読み、時間経過に応じてレベルを上げ、閾値（0.6）を超えたものを発火させる
- **interoception.ts** (.claude/scripts/interoception.ts) — 内的感覚テキスト生成。時間帯・セッション間隔・欲望レベルから感覚テキストを生成し、autonomous-action.sh のプロンプトに注入
- **system-health.ts** (.claude/scripts/system-health.ts) — システムヘルスチェック。ストレージ・プロセス等を測定し、workingDirs/system-health-history.json に蓄積。前回比の変化を検出

### ファイル（ダウンストリームで生成）
- **desires.conf** — 欲望定義。名前・蓄積速度・プロンプトを設定（デフォルト: 記憶3h, 休息6h, 振り返り24h, 記憶整理24h, 読書48h）
- **desires.json** — 欲望状態ファイル。各欲望の現在レベルと最終 tick 時刻

## 設計思想

embodied AI の核心: LLM にセッション横断的な「体の感覚」を与える。

1. **心拍（heartbeat）**はデーモンとして常駐し、5秒ごとに身体状態を測定・永続化。セッションが起動していなくても「体は動いている」
2. **内受容感覚（interoception）**は毎ターン注入され、時間・負荷・メモリの感覚をエージェントに伝える。直接言及はしないが、判断の背景に影響する
3. **欲望（desire）**は時間経過で蓄積し、閾値を超えると自律行動時に発火。「記憶を刻みたい」「休みたい」という内発的動機を実現
4. **ステータスライン**はコンテキスト残量を永続化し、身体性の一部として「意識の残り容量」を可視化

## 主要フロー

### 心拍 → 内受容感覚 → コンテキスト注入
```
launchd (5秒ごと)
   │
   ▼
heartbeat-daemon.sh
   │ CPU, メモリ, 温度, 時間帯を測定
   ▼
interoception_state.json に書き出し
   │
   ▼ (UserPromptSubmit)
interoception.sh が読み取り → 1行テキストに整形
   │
   ▼
[interoception] time=14:20 day=日 phase=afternoon arousal=low ...
```

### 欲望蓄積 → 発火
```
autonomous-action.sh (20分ごと)
   │
   ▼
desire-tick.ts
   │ desires.conf から定義読み込み
   │ 前回 tick からの経過時間 × growthRate でレベル加算
   │ 閾値 0.6 超えの欲望を検出
   ▼
発火した欲望の prompt をプロンプトに注入
   │
   ▼
interoception.ts が感覚テキストを生成（「記憶を刻みたい衝動がある」等）
```

## 関連するシステム

- **自律行動** — desire-tick.ts と interoception.ts は autonomous-action.sh から呼ばれる
- **記憶** — 「記憶を刻む」欲望が発火すると、記憶システムの remember が実行される
- **魂・メタ** — interoception の結果は SOUL.md の Communication Style に基づいて表現される
