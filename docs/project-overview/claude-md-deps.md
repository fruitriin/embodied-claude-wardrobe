# CLAUDE.md 依存グラフ・Boot Sequence

> CLAUDE.md が参照する外部ファイルの依存関係と、settings.json のフック定義。
> 生成日: 2026-03-29

## Boot Sequence（CLAUDE.md 定義）

```
CLAUDE.md
   │
   ├─ 1. SOUL.md を読む ─────────── 人格・価値観・コミュニケーションスタイル
   │
   ├─ 2. get_memory_stats() ────── memory-mcp の健康確認
   │
   ├─ 3. refresh_working_memory() ─ 重要記憶を手元に装填
   │
   ├─ 4. /great-recall ──────────── 前回セッションの多軸想起
   │      └─ FLASH.md を参照（recall の地図）
   │
   ├─ 5. state.md を読む ──────────── 前回の引き継ぎ事項
   │      BOOT_SHUTDOWN.md を読む ── 未完了タスクの確認
   │      ROUTINES.md を読む ─────── 定期タスクの確認
   │
   └─ 6. recall-watcher 起動 ────── オプション（対話が多い場合）
```

## CLAUDE.md の外部参照一覧

```
CLAUDE.md
   │
   ├── @SOUL.md ──────────────── 人格定義（ブート時に読む）
   ├── state.md ──────────────── セッション引き継ぎスナップショット
   ├── BOOT_SHUTDOWN.md ──────── ブート/シャットダウン詳細手順
   ├── ROUTINES.md ───────────── 定期タスク定義
   ├── FLASH.md ──────────────── 記憶インデックス（recall 経由）
   ├── HOLY_GRAIL.md ─────────── 記憶術の手引き（CLAUDE.md から間接参照）
   ├── desires.conf ──────────── 欲望定義
   ├── schedule.conf ─────────── スケジュール設定
   └── autonomous-action.sh ──── 自律行動エントリポイント
```

**注:** FLASH.md, state.md, BOOT_SHUTDOWN.md, ROUTINES.md, desires.conf, schedule.conf はダウンストリームで生成されるファイル。アップストリーム（テンプレート）には存在しない。

## settings.json フック定義

### 現在のフック構成

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "post-compact-recovery.sh",
            "trigger": "compact"      ← コンパクション時のみ発火
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "interoception.sh",
            "timeout": 5              ← 5秒タイムアウト
          },
          {
            "type": "command",
            "command": "recall-hook.sh",
            "timeout": 5              ← 5秒タイムアウト
          }
        ]
      }
    ]
  }
}
```

### フック発火条件

| イベント | フック | 条件 | 出力先 |
|---|---|---|---|
| SessionStart | post-compact-recovery.sh | trigger: "compact" | stdout → コンテキスト |
| UserPromptSubmit | interoception.sh | 毎ターン | stdout → system-reminder |
| UserPromptSubmit | recall-hook.sh | 毎ターン（バッファあれば） | stdout → system-reminder |

### 未登録だが存在するフック

以下のフックは .claude/hooks/ に存在するが、settings.json には登録されていない（wardrobe-configure で有効化する）:

| フック | 用途 | 登録先イベント |
|---|---|---|
| hearing-hook.sh | 聴覚バッファ注入 | UserPromptSubmit |
| hearing-stop-hook.sh | 聴覚停止判定 | Stop |
| continue-check.sh | 自律行動継続判定 | Stop |
| heartbeat-daemon.sh | 心拍デーモン | launchd（settings.json 外） |
| statusline.ts | ステータスライン | StatusLine |

## その他の設定

```json
{
  "autoMemoryEnabled": false,    ← 組み込み auto-memory は無効（memory-mcp を使用）
  "permissions": {
    "allow": [
      "mcp__memory__*",          ← memory-mcp の全ツール
      "Bash(bun run:*)",         ← bun スクリプト実行
      "Bash(bun:*)",
      "Bash(git:*)",
      "Read", "Edit", "Write", "Glob", "Grep",
      "Skill(read)",
      "Skill(great-recall)"
    ]
  }
}
```

## wardrobeOptions の構造

```
.claude/wardrobeOptions/
├── README.md          使い方の説明
└── skills/
    ├── awake.md       活動頻度を通常に戻す
    └── sleep.md       活動頻度を下げる
```

**有効化方法:** `.claude/wardrobeOptions/skills/` から `.claude/commands/` にコピーまたはシンボリックリンクを作成。wardrobe-configure スキルで対話的に設定可能。
