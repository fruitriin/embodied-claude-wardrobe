---
name: rebuild-index
description: "FLASH.mdを記憶DBから再構築する。コンテキスト圧縮による抜け漏れを防ぐ。"
argument-hint: "[対象期間（省略可、例: 先週）]"
user_invocable: true
---

@${CLAUDE_SKILL_DIR}/rebuild-index.exp.md

# /rebuild-index — FLASH.md 再構築

**サブエージェントで自律実行する。** memory DB から記憶を読み、FLASH.md のインデックスを再構築する。

## 実行

Agent ツールでサブエージェントを起動する（run_in_background: true でよい）。以下のプロンプトを渡す:

````
FLASH.md（記憶インデックス）を記憶 DB から再構築してください。

## 設定
- FLASH ファイル:
  - デフォルト（persona_id なし）: プロジェクトルートの `FLASH.md`
  - ペルソナ別: `FLASH-{persona短縮名}.md`
- 記憶 DB パス: memories/memory.db
- 対象期間: [ARGUMENTS があればここに入れる。なければ「全期間」]

## 手順

まず memory MCP の get_memory_stats で総件数を確認。

次に FLASH ファイルの現在の内容を読む。

### ループ: 記憶を読んで判断→書き込み

bun:sqlite で記憶を10件ずつ読む:
```bash
bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('memories/memory.db');
const rows = db.query('SELECT id, timestamp, content, importance, emotion, category FROM memories ORDER BY timestamp ASC LIMIT 10 OFFSET <N>').all();
for (const r of rows) console.log(JSON.stringify(r));
"
```

**Step A: 10件読む**

**Step B: 1件ずつ判断**

| 判断 | アクション |
|---|---|
| **索引に残す** | FLASH.md の該当週セクションにキーワード追記 |
| **スキップ** | 何もしない |
| **既存エントリを補強** | 既にある行にキーワードを足す |

索引に残す基準:
- 「あれいつだっけ？」と後で聞かれそうな出来事
- 設計判断の分岐点、方針変更
- 障害とその解決
- 具体的な技術用語・数字がある出来事
- 感情を伴う出来事

スキップする基準:
- 同じ出来事の重複記録
- 自明な日常的作業

**Step C: FLASH.md に書き出す**
10件の判断結果をまとめて Edit で追記。次の10件に進む前に必ず書く。

FLASH.md の見出し構造は週ごと:
- 今週 → 曜日単位（詳細）
- 先週 → 曜日単位
- 2〜3週前 → まとめて数行
- 4週以上前 → 月単位

**Step D: 粒度チェック**
- search_memories で引けるキーワードがあるか？
- 固有名詞・数字が入っているか？

**Step E: OFFSET += 10 して Step A に戻る**
````

## 研ぐ — 記憶スキル間の相互改善

- **/recall で引けなかったキーワードがあった** → 索引に残す基準が厳しすぎる
- **/recall で大量にノイズが引っかかった** → スキップ基準が甘い

## 経験の活用
- 実行前に ${CLAUDE_SKILL_DIR}/rebuild-index.exp.md が存在すれば読み、過去の経験を考慮する
- 実行後、新たな教訓があれば ${CLAUDE_SKILL_DIR}/rebuild-index.exp.md に追記する

入力: $ARGUMENTS
