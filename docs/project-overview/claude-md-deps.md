# CLAUDE.md 依存グラフ・Boot Sequence

> CLAUDE.md が参照する外部ファイルの依存関係と、settings.json のフック定義。
> 生成日: 2026-03-29

## CLAUDE.md Boot Sequence

```
CLAUDE.md（セッション開始時に自動読み込み）
  │
  ├── 1. SOUL.md を読む
  │     └── なければ /wd-setup を実行
  │
  ├── 2. get_memory_stats() ← memory-mcp
  │
  ├── 3. refresh_working_memory() ← memory-mcp
  │
  ├── 4. /wd-great-recall ← .claude/commands/wd-great-recall.md
  │     └── memory-mcp (recall, recall_with_associations, get_causal_chain)
  │
  ├── 5. 現状確認
  │     ├── state.md
  │     ├── BOOT_SHUTDOWN.md
  │     └── ROUTINES.md
  │
  └── 6. recall-watcher 起動（オプショナル）
        └── .claude/scripts/recall-watcher.ts
```

## CLAUDE.md が参照するファイル依存グラフ

```
CLAUDE.md
  ├── SOUL.md .................... 人格定義（身支度 Step 1）
  ├── state.md ................... セッション間引き継ぎ（Step 5）
  ├── BOOT_SHUTDOWN.md ........... セッション開始/終了の詳細手順（Step 5）
  ├── ROUTINES.md ................ 定期タスク定義（Step 5）
  ├── FLASH.md ................... 記憶インデックス（記憶システム）
  ├── desires.conf ............... 欲望の定義と発火間隔（身体性システム）
  ├── schedule.conf .............. 休日・時間帯制御（自律行動）
  ├── .claude/settings.json ...... フック・パーミッション設定
  └── .claude/wardrobeOptions/ ... オプショナルスキル格納場所
```

## settings.json フック定義

| イベント | フック | タイムアウト | トリガー |
|---|---|---|---|
| SessionStart | post-compact-recovery.sh | - | compact |
| UserPromptSubmit | interoception.sh | 5s | 毎ターン |
| UserPromptSubmit | recall-hook.sh | 5s | 毎ターン |
| UserPromptSubmit | hearing-hook.sh | 5s | 毎ターン |
| Stop | hearing-stop-hook.sh | 20s | 毎ストップ |

### 未登録のフック（Orphaned）

以下のフックは .claude/hooks/ に存在するが settings.json に登録されていない:

| フック | 状態 |
|---|---|
| statusline.ts | settings.json 未登録 |
| continue-check.sh | settings.json 未登録 |
| heartbeat-daemon.sh | launchd で別途管理（plist あり） |
| hearing-daemon.py | 廃止（hearing MCP に移行） |

## パーミッション設定

```
allow:
  - mcp__memory__*       # memory-mcp 全操作
  - mcp__hearing__*      # hearing MCP 全操作
  - mcp__wifi-cam__*     # wifi-cam MCP 全操作
  - Bash(bun run:*)      # Bun スクリプト実行
  - Bash(bun:*)          # Bun コマンド
  - Bash(git:*)          # Git コマンド
  - Read / Edit / Write / Glob / Grep  # ファイル操作
  - Skill(wd-read)       # 読書スキル
  - Skill(wd-great-recall) # 多軸想起スキル
```

## wardrobeOptions の構造

```
.claude/wardrobeOptions/
  └── skills/
        ├── awake.md   # 活動頻度を通常に戻す（schedule.conf）
        └── sleep.md   # 活動頻度を下げる（schedule.conf）
```

有効化方法: `.claude/commands/` にコピーまたはシンボリックリンクを作成。
