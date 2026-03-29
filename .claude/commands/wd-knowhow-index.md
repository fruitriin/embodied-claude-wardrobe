---
name: wd-knowhow-index
description: |
  docs/knowhow/ のインデックスを参照して「何を知っているか」を把握する。reindex 引数でインデックスを再構築する。
  プロジェクトの知見ベースを確認したいとき、ノウハウの追加・削除後にインデックスを更新したいときに使う。
user_invocable: true
---

@${CLAUDE_SKILL_DIR}/wd-knowhow-index.exp.md

# /wd-knowhow-index — 知見インデックス

## ディレクトリ構成

```
docs/knowhow/
  INDEX.md              ← 全体の統合インデックス
  wardrobe/             ← ワードローブ固有（アップストリーム還元対象）
  （その他）             ← 個人的な知識（ダウンストリーム固有）
```

## 引数
- **引数なし**: `docs/knowhow/INDEX.md` を読み、内容をそのまま返す
- **`reindex`**: `docs/knowhow/` 配下の全ファイルを再帰的に読み込み、インデックスを再構築する

## 引数なしの場合

1. `docs/knowhow/INDEX.md` を読む
2. 内容をそのまま返す

## `reindex` の場合

1. `docs/knowhow/` 配下の全 `.md` ファイルを**再帰的に**読む（`INDEX.md` 自体は除く）
2. 各ファイルについて以下を抽出する:
   - **ファイルパス**（サブディレクトリを含む相対パス）
   - **一行要約**: そのファイルが扱う中心トピック（1文）
   - **キーワード**: その知見を思い出すきっかけになる言葉（5〜15個）。具体的な名詞を優先する（技術用語でも日常用語でも）
3. `docs/knowhow/INDEX.md` に以下の形式で書き出す:

```markdown
# Knowhow Index

> 自動生成。`/wd-knowhow-index reindex` で再生成できる。

## Wardrobe（アップストリーム還元対象）

| ファイル | 要約 | キーワード |
|---|---|---|
| [wardrobe/example.md](wardrobe/example.md) | 例の知見 | keyword1, keyword2 |

## Personal

| ファイル | 要約 | キーワード |
|---|---|---|
| [example.md](example.md) | 例の知見 | keyword1, keyword2 |
```

4. `wardrobe/` 配下のファイルを「Wardrobe」セクションに、それ以外を「Personal」セクション配下にグルーピングする
5. 各セクション内はトピック領域ごとにさらにサブグループで並べる（領域は内容に応じて自動判定する）

## 注意

- キーワードは「検索で引っかかる」ことを重視する。抽象的な単語より具体的な名詞を優先する
- 新しい knowhow が追加されたら `/wd-knowhow-index reindex` を実行してインデックスを更新する
- `wardrobe/` はアップストリームに還元される知見。個人的な知識は `wardrobe/` の外に置く

入力: $ARGUMENTS
