---
name: wd-remember
description: "記憶を保存し、FLASH.mdにインデックスを追記する。記録と索引を一発で。"
argument-hint: "<記録内容>"
user_invocable: true
---

@${CLAUDE_SKILL_DIR}/wd-remember.exp.md

# /wd-remember — 記録して索引する

memory MCP に保存した後、FLASH.md にもキーワードを追記する。記録しても思い出せなければないのと同じ。索引まで含めて「記録」。

## 手順

### 1. 記憶の保存

`$ARGUMENTS` の内容を memory MCP の `remember` で保存する。

- 引数がなければ、直前の会話の流れから「何を記録すべきか」を判断する
- importance は内容に応じて 1〜5（日常の事実: 2、感情を伴う出来事: 3、転換点: 4〜5）
- category は内容に応じて選ぶ（daily, technical, conversation, memory）
- **persona_id**: 指定があればそのペルソナの記憶として保存する。単一ペルソナの場合は省略可

### 2. FLASH ファイルにインデックス追記

保存した記憶から **キーワードだけ** をペルソナ別の FLASH ファイルに追記する。

#### FLASH ファイルの選択

| 条件 | ファイル |
|---|---|
| persona_id なし（デフォルト） | プロジェクトルートの `FLASH.md` |
| persona_id あり | `FLASH-{persona短縮名}.md` |

#### キーワードの書き方

**動詞は抜く。固有名詞・数字・技術用語レベル。** search_memories や recall のきっかけになる粒度。

```
OK: Phase2 visibility-matrix 251テスト通過
NG: Phase2でvisibility-matrixのテストが251件通った
OK: ReACT interoception.ts 時間帯×欲望→感覚テキスト生成
NG: ReACTでinteroceptionスクリプトを実装した
```

#### 追記先

- **今週のセクション** の該当曜日の行に追加。なければ新しい行を作る

### 3. 確認

追記した内容を1行で返す。「記録した: [キーワード]」の形式。

## 週替わり処理

月曜の最初の /wd-remember で、先週のセクションを圧縮する:
- 直近1週間: 曜日単位
- 2週前: まとめて数行
- 3週前以前: さらに圧縮（月単位）

## 研ぐ — 記憶スキル間の相互改善

記録するたびに「このキーワードで後から引けるか？」を一瞬考える。

- **recall で引けなかった** → remember のキーワード粒度が足りない。OK/NG 例を更新する
- **recall で意図しない記憶が大量に引っかかった** → キーワードが汎用的すぎる。技術用語・数字を入れる
- **FLASH ファイルが肥大化して見通しが悪い** → rebuild-index の圧縮基準を見直す

不満や失敗があったら、このセクションか関連スキル（/wd-recall, /wd-rebuild-index）に経験則を書き足す。

## 経験の活用
- 実行前に ${CLAUDE_SKILL_DIR}/wd-remember.exp.md が存在すれば読み、過去の経験を考慮する
- 実行後、新たな教訓があれば ${CLAUDE_SKILL_DIR}/wd-remember.exp.md に追記する

入力: $ARGUMENTS
