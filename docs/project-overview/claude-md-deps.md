# CLAUDE.md 依存グラフ・Boot Sequence

> CLAUDE.md が参照する外部ファイルの依存関係と、settings.json のフック定義。
> 生成日: 2026-03-30

## CLAUDE.md の依存グラフ

```
CLAUDE.md
├── BOOT_SHUTDOWN.md ............... 身支度・日記の手順書
│   ├── SOUL.md .................... 人格定義（session-boot.sh で注入）
│   ├── state.md ................... 現在状態（session-boot.sh で注入）
│   ├── ROUTINES.md ................ 定期タスク
│   └── FLASH.md ................... 記憶インデックス
├── SOUL.md ........................ 人格定義（SOUL.md がないとき → /wd-setup）
├── FLASH.md ....................... 記憶の地図
├── desires.conf ................... 欲望定義
├── schedule.conf .................. スケジュール制御
├── ROUTINES.md .................... 定期タスク
├── autonomous-action.sh ........... 自律行動スクリプト
├── state.md ....................... 現在状態（確認なしで更新可）
├── TODO.md ........................ タスク管理（確認なしで更新可）
└── .claude/settings.json .......... フック・パーミッション
```

## Boot Sequence

### 1. SessionStart (startup|resume)

```
cron / ユーザー起動
  → .claude/settings.json の SessionStart hooks 発火
    → session-boot.sh (timeout: 5s)
      → SOUL.md を stdout に出力（コンテキスト注入）
      → state.md を stdout に出力（コンテキスト注入）
      → BOOT_SHUTDOWN.md の身支度手順を案内
    → reset-turn-count.sh (timeout: 5s)
      → .claude/.turn-count を 0 にリセット
```

### 2. SessionStart (compact)

```
コンテキスト圧縮発生
  → post-compact-recovery.sh
    → 復帰手順を stdout に出力
    → SOUL.md 再読 → 記憶復元 → タスク確認を案内
```

## settings.json フック定義

### SessionStart

| matcher | フック | timeout | 目的 |
|---|---|---|---|
| startup\|resume | session-boot.sh | 5s | SOUL.md + state.md 注入 |
| startup\|resume | reset-turn-count.sh | 5s | ターンカウンターリセット |
| compact | post-compact-recovery.sh | - | コンパクション復帰 |

### UserPromptSubmit

| フック | timeout | 目的 |
|---|---|---|
| interoception.sh | 5s | 身体状態注入（time/arousal/thermal/mem_free） |
| recall-hook.sh | 5s | 想起バッファ注入 |
| hearing-hook.sh | 5s | 聴覚バッファ注入 |
| turn-reminder.sh | 5s | 10ターン記憶リマインダー |

### Stop

| フック | timeout | 目的 |
|---|---|---|
| hearing-stop-hook.sh | 20s | 聴覚バッファチェック + ターン延長 |

## パーミッション設定

```json
{
  "allow": [
    "mcp__memory__*",
    "mcp__hearing__*",
    "mcp__wifi-cam__*",
    "Bash(bun run:*)",
    "Bash(bun:*)",
    "Bash(git:*)",
    "Read", "Edit", "Write", "Glob", "Grep",
    "Skill(wd-read)",
    "Skill(wd-great-recall)"
  ]
}
```

## wardrobeOptions の構造と有効化方法

```
.claude/wardrobeOptions/
└── skills/
    ├── sleep.md   — 活動頻度を下げる（schedule.conf 書き換え）
    └── awake.md   — 活動頻度を戻す（schedule.conf 書き換え）
```

有効化: `.claude/commands/` にシンボリックリンクを作成
```bash
ln -s ../wardrobeOptions/skills/sleep.md .claude/commands/sleep.md
ln -s ../wardrobeOptions/skills/awake.md .claude/commands/awake.md
```

`/wd-configure` で自律行動を有効にすると自動でリンクされる。
