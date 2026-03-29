---
name: wd-dice
description: 選択ダイス。意思決定で選択肢が並列で優先度がつかないときに使う。引数として選択肢を任意の個数とり、ランダムに1つ選んで返す。あなたはそれを実行する。例: `/wd-dice ラーメン カレー 寿司`
---

# /wd-dice — 選択ダイス

引数の選択肢からランダムに1つ選ぶ。

## 使い方

`/wd-dice 選択肢1 選択肢2 [選択肢3 ...]`

実行:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/roll.sh $ARGUMENTS
```

結果をそのままユーザーに伝える。
