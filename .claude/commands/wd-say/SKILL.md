---
name: wd-say
description: "非同期で声を出す。テキストを音声合成してスピーカーから再生する。"
---

# /wd-say — 非同期で声を出す

テキストを音声合成してスピーカーから再生する。バックグラウンドで実行されるため、発話中も思考を続けられる。

## 使い方

`/wd-say こんにちは` または `/wd-say "長いテキストもOK"`

## 実行方法

1. 引数 `$ARGUMENTS` をテキストとして受け取る
2. 以下のBashコマンドを実行する（`&` で投げっぱなし、戻りを待たない）:

```
"${CLAUDE_SKILL_DIR}/scripts/say.sh" "$ARGUMENTS" &
```

3. 発話を投げたらすぐ次の処理に進む。

## 注意

- テキストが空の場合はエラーメッセージを返す
- `--speaker local` でPC側のみ、`--speaker camera` でカメラ側のみに切り替え可能
- デフォルトは `--speaker both`（PC + カメラ両方）
- 環境変数は tts-mcp/.env と mcpBehavior.toml から読み込まれる
