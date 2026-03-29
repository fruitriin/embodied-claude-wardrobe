# システム間相互作用

> 6つの概念システム間の連携をアスキーアートで表現する。
> 生成日: 2026-03-29

## 1. 全システム関係図

```
                          ┌─────────────┐
                          │  魂・メタ    │
                          │  (Soul)     │
                          │ SOUL.md     │
                          │ CLAUDE.md   │
                          └──────┬──────┘
                                 │ 人格定義・ブートシーケンス
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
        ┌────────────┐  ┌────────────┐  ┌────────────┐
        │  記憶       │  │  身体性     │  │  自律行動   │
        │ (Memory)   │  │(Embodied)  │  │(Autonomous)│
        │ memory-mcp │  │ heartbeat  │  │ cron 20min │
        │ recall     │  │ desire     │  │ schedule   │
        │ remember   │  │ intero-    │  │ continue-  │
        │ FLASH.md   │  │ ception    │  │ check      │
        └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
              │               │               │
              │   ┌───────────┘               │
              │   │  欲望発火                  │
              │   │  recall-lite              │
              │   │  interoception.ts         │
              │   ▼                           │
              │  ┌────────────────────────────┘
              │  │  autonomous-action.sh が
              │  │  全システムを束ねて実行
              │  │
              ▼  ▼
        ┌────────────┐          ┌────────────┐
        │  知覚       │          │  読書       │
        │ (Senses)   │          │ (Reading)  │
        │ observe    │◀─ 視覚 ──│ slide-watch│
        │ look/clip  │   記憶 ──│ read       │
        │ hearing    │  を共有   │ reader.ts  │
        │ say        │          │            │
        └────────────┘          └────────────┘
```

### 主要な連携パス

| 起点 | 終点 | 連携内容 |
|---|---|---|
| 魂 → 全体 | SOUL.md の人格定義がすべての振る舞いに影響 |
| 魂 → 記憶 | HOLY_GRAIL.md がブートシーケンスで記憶起動を定義 |
| 身体性 → 自律行動 | desire-tick.ts, interoception.ts がプロンプトに注入 |
| 記憶 → 自律行動 | recall-lite.ts が自律行動時の記憶コンテキスト提供 |
| 知覚 → 記憶 | observe の save_visual_memory, 聴覚の文字起こし記録 |
| 読書 → 記憶 | 読後の感想を /remember で保存 |
| 自律行動 → 記憶 | 欲望「記憶を刻む」発火 → 記憶整理 |
| 自律行動 → 読書 | 欲望「読書」発火 → /read 実行 |

---

## 2. セッションライフサイクル × フック発火タイミング図

```
┌─ 対話セッション ──────────────────────────────────────────────┐
│                                                              │
│  SessionStart                                                │
│  ├─ [compact] post-compact-recovery.sh                       │
│  │   └→ 「SOUL.md を読め、記憶を引け」を注入                   │
│  │                                                           │
│  ▼                                                           │
│  ブートシーケンス（CLAUDE.md 定義）                              │
│  ├─ SOUL.md 読む                                             │
│  ├─ get_memory_stats()                                       │
│  ├─ refresh_working_memory()                                 │
│  ├─ /great-recall                                            │
│  ├─ state.md 読む                                            │
│  └─ recall-watcher 起動（オプション）                           │
│                                                              │
│  ┌─ 対話ループ ────────────────────────────────────────┐      │
│  │                                                    │      │
│  │  UserPromptSubmit                                  │      │
│  │  ├─ interoception.sh → [interoception] 1行注入     │      │
│  │  └─ recall-hook.sh → recall_buffer 注入（あれば）    │      │
│  │       ├─ hearing-hook.sh → [hearing] 注入（あれば）  │      │
│  │                                                    │      │
│  │  ユーザー発言 → エージェント応答                       │      │
│  │                                                    │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  シャットダウン（CLAUDE.md 定義）                                │
│  ├─ state.md 上書き                                          │
│  ├─ /remember で成果・未了を記録                                │
│  └─ link_memories で因果整理                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ 自律行動セッション ──────────────────────────────────────────┐
│                                                              │
│  cron (*/20) → autonomous-action.sh                          │
│  ├─ schedule.conf チェック → 確率でスキップ                      │
│  ├─ desire-tick.ts → 欲望レベル更新・発火検出                    │
│  ├─ interoception.ts → 感覚テキスト生成                         │
│  ├─ recall-lite.ts → 軽量記憶コンテキスト                       │
│  ├─ load-prompts.ts → プロンプトテンプレート                     │
│  │                                                           │
│  ▼                                                           │
│  claude -p でワンショット実行                                    │
│  │                                                           │
│  ▼                                                           │
│  Stop hook: continue-check.sh                                │
│  ├─ [CONTINUE] → ターン延長                                   │
│  └─ [DONE] / MAX → 終了                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ 常駐デーモン（セッション非依存）──────────────────────────────┐
│                                                              │
│  launchd (5秒ごと)                                           │
│  └─ heartbeat-daemon.sh → interoception_state.json 更新      │
│                                                              │
│  hearing-daemon (常駐)                                        │
│  └─ hearing_buffer.jsonl に蓄積                               │
│                                                              │
│  statusline.ts (セッション中のみ)                               │
│  └─ context_usage.json 更新                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 記憶想起フロー図（recall-watcher → recall-hook → コンテキスト注入）

```
ターン N                          ターン N+1
────────                          ──────────

ユーザー: 「あの設計って...」      ユーザー: 「続きだけど」
    │                                 │
    ▼                                 │
 recall-watcher.ts                    │
    │ ccconv watch でユーザー発言検知   │
    │                                 │
    ▼                                 │
 memory MCP recall() × 3軸            │
    │ 技術的: 設計判断の履歴            │
    │ 感情的: 決定時の感情             │
    │ 因果的: 原因→結果の連鎖          │
    │                                 │
    ▼                                 │
 tmp/recall_buffer.jsonl に書き出し    │
    │                                 │
    │    ┌────────────────────────────┘
    │    │ UserPromptSubmit フック発火
    │    ▼
    │  recall-hook.sh
    │    │ バッファ読み取り → 整形
    │    │ バッファ flush
    │    ▼
    │  コンテキストに注入:
    │  「そういえば、あの設計は...」
    │
    ▼
 エージェント応答                   エージェント応答
 （まだ記憶なし）                   （記憶を踏まえて回答）

 ※ 1ターン遅延するが、「思い出してきた」タイミングとして自然
```
