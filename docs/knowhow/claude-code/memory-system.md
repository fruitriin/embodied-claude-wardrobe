# Memory System（メモリシステム内部設計）

ソースマップ解析による未公開機能レポート（2026-03-31）

## 概要

公開情報: MEMORY.md が存在し、先頭200行/25KBがシステムプロンプトに注入される。
未公開: **自動抽出（extractMemories）** と **自動統合（autoDream）** のバックグラウンドプロセス。

## 1. extractMemories — 自動記憶抽出

### トリガー

毎ターン終了時（モデルがツール呼び出しなしの最終レスポンスを返した時点）に、
`stopHooks` から fire-and-forget で起動。

### 動作

- **forked subagent** として起動（メインの会話をフォーク、プロンプトキャッシュ共有）
- 直近の新規メッセージを分析し、記憶すべきものをメモリファイルに書き出す
- 最大5ターン。推奨戦略: ターン1で全Read並列、ターン2で全Write/Edit並列
- メインエージェントが自分でメモリに書いたターンは**スキップ**（mutual exclusion）

### 記憶の4タイプ分類

| タイプ | 内容 | スコープ |
|---|---|---|
| `user` | ユーザーの役割・好み・知識レベル | 常に private |
| `feedback` | ユーザーからの指導（成功からも記録） | デフォルト private |
| `project` | 進行状況・判断・期限 | team 寄り |
| `reference` | 外部リソースへのポインタ | 通常 team |

### 保存しないもの（明示的禁止）

- コードパターン、アーキテクチャ、ファイル構造（コードから導出可能）
- git 履歴（git log が正）
- デバッグ解決策（コミットメッセージにある）
- CLAUDE.md に既に書いてあること
- 一時的なタスク状態

### ツール制限

Read/Grep/Glob: 無制限、Bash: 読み取り専用、Edit/Write: メモリディレクトリ内のみ

### GrowthBook フラグ

- `tengu_passport_quail` — extractMemories の有効化ゲート
- `tengu_bramble_lintel` — N ターンに1回の実行頻度（デフォルト 1）

## 2. autoDream — 記憶統合（「夢」）

### トリガー（ゲート判定、安い順）

```
1. 時間ゲート: 前回から 24時間以上経過（ロックファイルの mtime を stat）
2. スキャンスロットル: 前回のスキャンから 10分以上経過
3. セッションゲート: 5セッション以上蓄積（現在セッション除外）
4. ロックゲート: 他プロセスが統合中でない
```

### 4フェーズプロンプト

```
Phase 1 — Orient: ls + MEMORY.md + 既存ファイルスキム
Phase 2 — Gather: 日次ログ、矛盾する古い記憶、トランスクリプト grep
Phase 3 — Consolidate: マージ、相対日付→絶対日付変換、矛盾修正
Phase 4 — Prune & Index: MEMORY.md を 200行/25KB 以内に維持
```

### ロックファイル設計

```
ファイル: <memory-dir>/.consolidate-lock
内容: PID（テキスト）
mtime = lastConsolidatedAt（utimes で制御）
```

### UI 統合

- DreamTask としてフッターに表示、Shift+Down で詳細ダイアログ
- ユーザーが kill 可能
- 完了時に "Improved N memories" メッセージ

### GrowthBook フラグ

`tengu_onyx_plover`: `{ enabled, minHours(24), minSessions(5) }`

## 3. チームメモリ（TEAMMEM）

- `private/`: 個人メモリ（user, feedback の個人分）
- `team/`: チーム共有メモリ（project, reference, feedback の規約分）
- 各ディレクトリに独立した MEMORY.md 索引
- team に機密データ保存禁止

## 出典

- `src/services/extractMemories/extractMemories.ts`, `prompts.ts`
- `src/services/autoDream/autoDream.ts`, `consolidationPrompt.ts`, `config.ts`, `consolidationLock.ts`
- `src/memdir/memoryTypes.ts`, `memdir.ts`, `memoryScan.ts`, `paths.ts`
- `src/tasks/DreamTask/DreamTask.ts`
