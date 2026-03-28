# CLAUDE.md — embodied-claude-wardrobe

> このファイルは Claude Code エージェントがセッションを開始するときに読む設計書です。

## ブートシーケンス（セッション開始時に必ず実行）

1. **SOUL.md を読む** — 自分が誰かを思い出す。人格・価値観・コミュニケーションスタイルを認識する
2. **記憶の健康を確認する** — `get_memory_stats()` で記憶の総数と分布を確認する
3. **作業記憶を装填する** — `refresh_working_memory()` で重要な記憶を手元に置く
4. **文脈を想起する** — `/great-recall` で前回セッションの状態を多軸想起する。何をしていたか、何が途中だったかを復元する
5. **現状を確認する** — `state.md` を読んで前回の引き継ぎ事項を把握する。次に BOOT_SHUTDOWN.md、ROUTINES.md を確認し、未完了のタスクがあれば継続する
6. **追想システムを起動する**（オプショナル）— recall-watcher をバックグラウンドで起動。日常対話が多い場合に有効。技術的な話題が続くときはノイズになるため、その際は停止して `/recall` や `/great-recall` を手動で使う

## セッション終了時（シャットダウン手順）

BOOT_SHUTDOWN.md の「シャットダウン手順」に従う。最低限:
1. `state.md` を現在の状態で上書き更新する（次のセッションへの引き継ぎ）
2. 今回のセッションの成果を `/remember` で記憶に刻む
3. 未完了のタスクがあれば状態を `/remember` で記録する
4. 関連する記憶があれば `link_memories` で因果関係を繋ぐ

## 記憶システム

### 基本操作
- **記憶を保存**: `/remember` — 記憶と FLASH.md インデックスを一度に更新
- **記憶を想起**: `/recall` — FLASH.md をガイドにサブエージェントで検索（コンテキスト節約）
- **多軸想起**: `/great-recall` — 技術的・感情的・因果的の3軸で並列検索
- **インデックス再構築**: `/rebuild-index` — FLASH.md を記憶 DB から再構築

### 記憶のベストプラクティス
- 重要な決定には importance 4-5 をつける
- 感情が動いた瞬間は emotion を正確に記録する（想起の鍵になる）
- 新しい記憶を刻んだら、関連する既存の記憶がないか recall して link_memories で繋ぐ
- 散らばった記憶は create_episode でエピソードにまとめる

## 身体性システム

### interoception（内受容感覚）
毎ターン UserPromptSubmit で自動注入される。以下の情報が含まれる:
- `time` — 現在時刻
- `day` — 曜日
- `phase` — 時間帯（morning/midday/afternoon/evening/night/late-night）
- `arousal` — 覚醒度（CPU 負荷等から算出）
- `thermal` — 発熱状態
- `mem_free` — メモリ余裕

### 欲望システム
`desires.conf` で定義された欲望が時間とともに蓄積し、閾値を超えると自律行動時に発火する。
デフォルトの欲望: 記憶を刻む（3h）、休息（6h）、振り返り（24h）、記憶整理（24h）、読書（48h）

## 自律行動

`autonomous-action.sh` を cron で20分ごとに実行する:
```
*/20 * * * * /path/to/autonomous-action.sh
```

時間帯・曜日に応じて間引かれる。`schedule.conf` でカスタマイズ可能。

> **オプショナルスキル**: `/sleep`（活動頻度を下げる）と `/awake`（頻度を戻す）は自律行動環境でのみ意味がある。
> デフォルトでは無効。使う場合は `.claude/wardrobeOptions/skills/` からコピーまたはシンボリックリンクで `.claude/commands/` に配置すること。

## 読書・外部コンテンツ

- `/read [URL]` — Web ページをリーダーモードで取得。1ページずつ読み、感想を書く
- `sanitize` — 外部コンテンツの不可視文字を検出・除去

## ランタイム

- **memory-mcp**: Python (uv) — `cd memory-mcp && uv run memory-mcp`
- **スクリプト**: Bun (TypeScript) — `bun run .claude/scripts/xxx.ts`
- **フック**: Bash

## カスタマイズ

- `SOUL.md` — あなたのエージェントの人格を定義する。テンプレートから始めて自分で書く
- `state.md` — セッション間で引き継ぐ「今の状態」のスナップショット。ブート時に読み、シャットダウン時に上書き更新する。記憶（memory-mcp）が長期的な蓄積なのに対し、state.md は最新の状態だけを保持する
- `desires.conf` — 欲望の種類と発火間隔を調整する
- `schedule.conf` — 休日・時間帯の制御
- `ROUTINES.md` — 定期的に行うタスクを定義する
- `.claude/settings.json` — フックの有効/無効、パーミッション設定
