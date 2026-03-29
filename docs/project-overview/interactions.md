# システム間相互作用

> 6つの概念システム間の連携をアスキーアートで表現する。
> 生成日: 2026-03-29

## 1. 全システム関係図

```
                    ┌─────────────────────┐
                    │  魂・ハーネス        │
                    │  (soul-harness)      │
                    │  SOUL.md / CLAUDE.md │
                    │  settings.json       │
                    └──────┬──────────────┘
                           │ ブート・設定・フック定義
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
 ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
 │ 記憶 (memory)  │ │ 身体性       │ │ 自律行動          │
 │ memory-mcp     │ │ (embodied)   │ │ (autonomous)      │
 │ recall/remember│ │ interoception│ │ cron / ROUTINES   │
 │ FLASH.md       │ │ desire/heart │ │ schedule/prompts  │
 └───┬────────┬───┘ └──────┬───────┘ └────┬─────────────┘
     │        │            │               │
     │   ┌────┘     欲望発火│        desire-tick
     │   │     ┌───────────┘        interoception.ts
     │   │     │                         │
     ▼   ▼     ▼                         ▼
 ┌────────────────┐              ┌──────────────────┐
 │ 知覚           │              │ 読書・知識        │
 │ (perception)   │◄─── 読書 ───│ (reading-         │
 │ camera/hearing │   欲望発火   │  knowledge)       │
 │ observe/look   │              │ read/knowhow      │
 └────────────────┘              └──────────────────┘

 凡例:
  ─── データフロー / 連携
  ─── 欲望発火による間接的連携
```

## 2. セッションライフサイクル × フック発火タイミング

```
 セッション開始
 │
 ├── [SessionStart:compact] post-compact-recovery.sh
 │     └── SOUL.md 再読 + 記憶復元指示
 │
 ├── ブートシーケンス（CLAUDE.md に定義）
 │     1. SOUL.md 読み
 │     2. get_memory_stats()
 │     3. refresh_working_memory()
 │     4. /wd-great-recall
 │     5. state.md + ROUTINES.md 確認
 │     6. recall-watcher 起動（オプショナル）
 │
 ├── 対話ループ ─────────────────────────────────────┐
 │     │                                              │
 │     ├── [UserPromptSubmit]                          │
 │     │     ├── interoception.sh → 内受容感覚注入     │
 │     │     ├── recall-hook.sh → 想起バッファ注入     │
 │     │     └── hearing-hook.sh → 聴覚バッファ注入    │
 │     │                                              │
 │     ├── ユーザー入力 → エージェント応答              │
 │     │                                              │
 │     ├── [Stop]                                      │
 │     │     ├── hearing-stop-hook.sh → 新発話で延長?  │
 │     │     └── continue-check.sh → [CONTINUE]で延長? │
 │     │                                              │
 │     └── 繰り返し ◄──────────────────────────────────┘
 │
 ├── シャットダウン手順（BOOT_SHUTDOWN.md に定義）
 │     1. state.md 上書き
 │     2. /wd-remember で成果記録
 │     3. /wd-remember で未了記録
 │     4. link_memories
 │     5. create_episode（長セッション時）
 │
 └── セッション終了
```

## 3. 記憶想起フロー

```
 ┌─────────────────────────────────────────────────────────┐
 │                  受動的想起（自動）                       │
 │                                                         │
 │  recall-watcher.ts (バックグラウンド)                     │
 │    │                                                    │
 │    ├── ccconv talk --watch (stdin パイプ)                │
 │    │     └── ユーザー発言を監視                          │
 │    │                                                    │
 │    ├── キーワード抽出                                    │
 │    │                                                    │
 │    ├── memory-mcp.recall()                              │
 │    │                                                    │
 │    └── recall_buffer.jsonl に書き出し                     │
 │          │                                              │
 │          ▼                                              │
 │    recall-hook.sh [UserPromptSubmit]                     │
 │          │                                              │
 │          └── [recall] プレフィックス付きでコンテキスト注入│
 │                                                         │
 └─────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────┐
 │                  能動的想起（手動）                       │
 │                                                         │
 │  /wd-recall                                             │
 │    ├── FLASH.md 読み → キーワードの当たりをつける         │
 │    └── サブエージェント起動                              │
 │          └── memory-mcp.search_memories()               │
 │                                                         │
 │  /wd-great-recall                                       │
 │    ├── Step 0: メタ圧縮器（どの軸を選ぶか）              │
 │    └── Step 1: 3つの圧縮器サブエージェント並列            │
 │          ├── 技術的圧縮器 → recall + search_memories     │
 │          ├── 感情的圧縮器 → recall_with_associations     │
 │          └── 因果的圧縮器 → get_causal_chain             │
 │          └── 統合結果                                    │
 │                                                         │
 └─────────────────────────────────────────────────────────┘
```
