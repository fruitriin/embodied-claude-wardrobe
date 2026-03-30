# システム間相互作用

> 6つの概念システム間の連携をアスキーアートで表現する。
> 生成日: 2026-03-30

## 1. 全システム関係図

```
                        ┌──────────────────┐
                        │   魂・ハーネス    │
                        │ SOUL.md/CLAUDE.md│
                        │ session-boot.sh  │
                        │ レビューエージェント│
                        └────────┬─────────┘
                                 │ 設計定義・セッション起動
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │     記憶       │  │    身体性      │  │   読書・知識    │
   │  memory-mcp    │  │ interoception  │  │   wd-read      │
   │  FLASH.md      │◄─┤ desire-tick    │  │   wd-knowhow   │
   │  recall/remember│  │ heartbeat      │  │   wd-cc-tracker│
   └───────┬────────┘  └───────┬────────┘  └────────────────┘
           │                   │
           │  recall-lite      │  desire-tick
           │  turn-reminder    │  interoception.ts
           ▼                   ▼
        ┌──────────────────────────┐
        │       自律行動            │
        │  autonomous-action.sh    │
        │  schedule.conf           │
        │  ROUTINES.md             │
        └────────────┬─────────────┘
                     │ continue-check
                     │ hearing-stop-hook (共有)
                     ▼
        ┌──────────────────────────┐
        │        知覚              │
        │  wd-observe / wd-look    │
        │  wd-say / hearing        │
        │  wifi-cam / tts-mcp      │
        └──────────────────────────┘
```

**凡例:**
- `→` / `▼`: データの流れ・依存方向
- `◄─`: 逆方向の参照（記憶 ← 身体性: 「記憶を刻む」欲望）

## 2. セッションライフサイクル × フック発火タイミング

```
┌─── セッション開始 ─────────────────────────────────────────────────┐
│                                                                   │
│  SessionStart (startup|resume)                                    │
│  ├── session-boot.sh ──→ SOUL.md + state.md 注入                 │
│  └── reset-turn-count.sh ──→ .turn-count = 0                    │
│                                                                   │
│  SessionStart (compact)                                           │
│  └── post-compact-recovery.sh ──→ 復帰手順注入                   │
│                                                                   │
├─── ターンループ ──────────────────────────────────────────────────┤
│                                                                   │
│  UserPromptSubmit (毎ターン)                                      │
│  ├── interoception.sh ──→ [interoception] time=... arousal=...   │
│  ├── recall-hook.sh ──→ [recall] 関連記憶（バッファあれば）       │
│  ├── hearing-hook.sh ──→ [hearing] 文字起こし（バッファあれば）   │
│  └── turn-reminder.sh ──→ 10ターン目: 記憶リマインダー           │
│                                                                   │
│  ユーザー ←→ エージェント の対話                                  │
│                                                                   │
├─── セッション終了 ────────────────────────────────────────────────┤
│                                                                   │
│  Stop                                                             │
│  └── hearing-stop-hook.sh ──→ 聴覚バッファチェック               │
│       └── 新発話あり → ターン延長（block）                        │
│       └── HEARTBEAT=1 → continue-check.sh                        │
│            └── [CONTINUE: ...] → ターン延長                       │
│            └── [DONE] or MAX → 終了                               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## 3. 記憶想起フロー図

### 3a. リアルタイム自動想起（対話セッション）

```
ユーザー発言
  │
  ├──→ recall-watcher.ts (バックグラウンド常駐)
  │      │
  │      ├── ccconv talk --watch からパイプで受信
  │      ├── キーワード抽出
  │      ├── memory-mcp.recall()
  │      └── tmp/recall_buffer.jsonl に書き出し
  │
  ├──→ UserPromptSubmit 発火
  │      │
  │      └── recall-hook.sh
  │            ├── recall_buffer.jsonl を読み取り
  │            ├── [recall] プレフィックスで整形
  │            ├── stdout → コンテキスト注入
  │            └── バッファを flush
  │
  └──→ エージェントのレスポンスに記憶が自然に混入
```

### 3b. 手動想起

```
エージェント or ユーザー: 「あれどうなったっけ？」
  │
  ├── FLASH.md でキーワードの当たりをつける
  │
  └── /wd-recall (Agent tool, model: haiku)
        ├── FLASH.md 読み取り
        ├── search_memories（キーワード + 日付絞り込み）
        │   or bun:sqlite 直接クエリ
        ├── 結果を整形して返却
        └── メインコンテキストに結果を返す
```

### 3c. 多軸想起

```
/wd-great-recall "文脈"
  │
  ├── Step 0: メタ圧縮器
  │     └── キーワードパターン → 起動する軸を選択
  │
  └── Step 1: 並列サブエージェント (haiku × 2-3)
        ├── [技術的] recall + recall_with_associations → 設計判断/パターン/依存
        ├── [感情的] recall + recall_divergent → 感情/関係/動機/発見
        └── [因果的] recall + get_causal_chain → 因果連鎖/時系列/進行中
        │
        └── メインエージェントが統合所見を書く
```

### 3d. 自律行動時の想起（Heartbeat）

```
autonomous-action.sh
  │
  └── recall-lite.ts (bun:sqlite 直接、MCP 不使用)
        ├── 直近48h の重要記憶 (importance >= 4)
        ├── 高頻度アクセス記憶 (access_count 上位)
        └── 未完了タスク (content LIKE '%未完了%')
        │
        └── プロンプトにサイレント注入
```
