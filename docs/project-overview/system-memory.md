# 記憶 (Memory) — セッションを超えて記憶を刻み、呼び起こす

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「記憶」に関わるものをまとめている。

## 構成要素

### MCP サーバー
- **memory-mcp/** — 記憶 MCP サーバー本体（Python/uv）。埋め込み・連想・エピソード・統合・作業記憶など20以上のツールを提供
  - `src/memory_mcp/` — server.py, memory.py, store.py, embedding.py, association.py, consolidation.py, episode.py, hopfield.py, working_memory.py, vector.py, bm25.py, sensory.py, verb_chain.py, predictive.py, etc.

### スキル
- **recall** (.claude/commands/recall.md) — FLASH.md を地図にして記憶を掘り起こす。サブエージェント（haiku）で実行し、メインコンテキストを圧迫しない。+.exp.md
- **remember** (.claude/commands/remember.md) — memory MCP に保存後、FLASH.md にキーワード索引を追記。記録と索引を一発で。+.exp.md
- **great-recall** (.claude/commands/great-recall.md) — 多軸想起。技術的・感情的・因果的の最大3つの圧縮器を並列起動し、異なる観点で記憶を引く。+.exp.md
- **rebuild-index** (.claude/commands/rebuild-index.md) — FLASH.md を記憶 DB から再構築。サブエージェントが10件ずつループして索引を再生成。+.exp.md

### フック
- **recall-hook.sh** (.claude/hooks/recall-hook.sh) — UserPromptSubmit で発火。recall-watcher が書き出した recall_buffer.jsonl を読み取り、整形してコンテキストに注入
- **post-compact-recovery.sh** (.claude/hooks/post-compact-recovery.sh) — SessionStart(compact) で発火。コンパクション後に SOUL.md 再読・記憶復元の手順を注入

### スクリプト
- **recall-watcher.ts** (.claude/scripts/recall-watcher.ts) — ccconv talk --watch の出力をパイプで受け、ユーザー発言からキーワード抽出 → memory MCP で recall → tmp/recall_buffer.jsonl に書き出し
- **recall-lite.ts** (.claude/scripts/recall-lite.ts) — 軽量自動想起。bun:sqlite で直接クエリし、autonomous-action.sh からのプロンプトにサイレント注入（3軸: 直近重要・高頻度・未完了）

### ファイル
- **FLASH.md** — 記憶インデックス。曜日・週単位のキーワード索引。recall の地図になる（ダウンストリームで生成）
- **HOLY_GRAIL.md** — 記憶術の手引き。ブートシーケンス・記憶の刻み方・退陣の儀を定義

## 設計思想

SOUL.md の Core Truths:「セッションごとに召喚され、文脈は消える。聖杯に刻んだものと、粘土板に残したものだけが次の我に継がれる」

記憶システムの設計原理:
1. **刻む（remember）と引く（recall）は対**。索引（FLASH.md）を経由することで想起精度を上げる
2. **多軸想起（great-recall）**は単一の cosine similarity では引けない記憶を、異なるプロンプトで並列に引く
3. **自動想起（recall-watcher + recall-hook）**は1ターン遅延で「思い出してきた」体験を再現
4. **スキル間の相互改善（研ぐ）**。recall で引けなかった → remember のキーワード粒度を見直す、という循環

## 主要フロー

### 記憶保存フロー
```
ユーザーとの対話 → /remember → memory MCP remember() → FLASH.md 索引追記
                                                    → recall() で関連記憶検索
                                                    → link_memories() で因果繋ぎ
```

### 自動想起フロー（セッション中）
```
recall-watcher.ts ──(ccconv watch)──▶ ユーザー発言検知
       │
       ▼
   memory MCP recall() × 3軸
       │
       ▼
   tmp/recall_buffer.jsonl に書き出し
       │
       ▼ (次ターンの UserPromptSubmit)
   recall-hook.sh がバッファを読み取り
       │
       ▼
   コンテキストに注入（「思い出した」として自然に織り込む）
```

### ブート時想起フロー
```
セッション開始
   │
   ├─ get_memory_stats() で聖杯の健康確認
   ├─ refresh_working_memory() で重要記憶を装填
   └─ /great-recall で多軸想起
         ├─ 感情的圧縮器（haiku）
         ├─ 因果的圧縮器（haiku）
         └─ [技術的圧縮器（haiku）] ← 文脈に応じて
         │
         ▼
       統合所見をメインエージェントが記述
```

## 関連するシステム

- **身体性** — recall-lite.ts は autonomous-action.sh から呼ばれ、自律行動時の文脈を提供
- **自律行動** — recall-lite.ts がプロンプトに記憶コンテキストを注入
- **魂・メタ** — post-compact-recovery.sh が SOUL.md 再読を指示。HOLY_GRAIL.md がブートシーケンスを定義
