---
name: wd-recall
description: "FLASH.mdを地図にして記憶を掘り起こす。サブエージェントで動くので会話コンテキストを汚さない。"
argument-hint: "<思い出したいこと>"
user_invocable: true
---

@${CLAUDE_SKILL_DIR}/wd-recall.exp.md

# /wd-recall — 思い出す

「あの実装どうなったっけ？」「前に何を決めた？」に答える。FLASH.md でキーワードの当たりをつけてから、search_memories と SQL で深掘りする。

**サブエージェントで実行する。** メインの会話コンテキストを圧迫しない。

## 手順

### 1. サブエージェント起動

Agent ツールで以下のプロンプトを渡す（model: haiku）:

```
以下のキーワードに関連する記憶を探してください。

検索キーワード: [ARGUMENTS]
呼び出し元ペルソナ: [persona_id（なければ「なし」）]

手順:
1. FLASH ファイルを読んで、関連する日付・キーワードの当たりをつける
   - persona_id なし → プロジェクトルートの FLASH.md
   - persona_id あり → FLASH-{persona短縮名}.md を優先し、FLASH.md も読む
   - 全ペルソナの記憶を横断したい場合は FLASH*.md を全て読む

2. 当たりがついたら、memory MCP の search_memories で日付周辺を検索する
   - persona_id があれば、まず自分の persona_id で検索
   - 見つからなければ persona_id なし、または "*" で横断検索

3. 日付の当たりがつかなければ、memory MCP の search_memories でキーワード検索する。
   または bun:sqlite で直接検索:
   bun -e "
   import { Database } from 'bun:sqlite';
   const db = new Database('memories/memory.db');
   const rows = db.query(\"SELECT timestamp, substr(content,1,300) FROM memories WHERE content LIKE '%キーワード%' ORDER BY timestamp DESC LIMIT 10\").all();
   for (const r of rows) console.log(r.timestamp.slice(0,10), r['substr(content,1,300)']);
   "

4. 見つかった記憶を以下の形式でまとめて返す:
   - いつ: 日付
   - 誰が: persona_id（あれば）
   - 何が: 出来事の要約（1〜2行）
   - 感情: あれば
   - 関連キーワード: 他に引けそうなもの
```

### 2. 結果を受け取る

サブエージェントの結果を受け取ったら:
- 会話の文脈に合わせて自然に返す（報告書にしない）
- FLASH.md に載っていない記憶が見つかったら追記する

### 3. 引けなかった場合

- 「記憶にないかも」と正直に返す
- 別のキーワードで試すことを提案する

## 会話中の自発的リコール

/recall はスキルとして呼ぶだけでなく、**会話中に関連する話題が出たら自発的にサブエージェントを起動してよい**。

**FLASH.md のキーワードが引き金になる。** だから FLASH.md の粒度が命。

## 研ぐ — 記憶スキル間の相互改善

思い出すたびに「引けたか？引けなかったか？なぜか？」を振り返る。

- **FLASH にキーワードがなくて当たりがつかなかった** → /wd-remember のキーワード粒度が足りない
- **FLASH にはあったが search_memories で引けなかった** → 記憶本文にキーワードが含まれていない
- **古い記憶が圧縮されすぎて引けない** → /wd-rebuild-index の圧縮基準を緩める
- **他ペルソナの記憶が必要だった** → FLASH*.md を横断検索するか、persona_id="*" で横断

不満や発見があったら、このセクションか関連スキルに書き足す。

## 経験の活用
- 実行前に ${CLAUDE_SKILL_DIR}/wd-recall.exp.md が存在すれば読み、過去の経験を考慮する
- 実行後、新たな教訓があれば ${CLAUDE_SKILL_DIR}/wd-recall.exp.md に追記する

入力: $ARGUMENTS
