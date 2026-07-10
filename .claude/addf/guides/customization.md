# カスタマイズガイド

> スキル・フック・スクリプトの変更と追加。wardrobe を自分に合わせて仕立てる。

---

## wardrobe の拡張ポイント

| 種類 | 配置場所 | 実行タイミング |
|---|---|---|
| スキル | `.claude/commands/*.md` | ユーザーが `/スキル名` で明示的に呼ぶ |
| フック | `.claude/hooks/*.sh` | イベント（セッション開始、ターン送信等）で自動実行 |
| スクリプト | `.claude/scripts/*.ts` | スキルやフックから呼ばれる |
| エージェント | `.claude/agents/*.md` | Agent ツールで起動するサブエージェント |

---

## スキルの追加

### 基本構造

`.claude/commands/my-skill.md` を作成する:

```markdown
---
name: my-skill
description: スキルの説明
argument-hint: "<引数の説明>"
---

# /my-skill

ここにスキルのプロンプトを書く。
```

frontmatter の `name` がスキル名になる。`/my-skill` で呼び出せる。

### ディレクトリ構造のスキル

スクリプトやツールを伴うスキルは、ディレクトリ構造にできる:

```
.claude/commands/my-skill/
  SKILL.md          # スキル本体（frontmatter + プロンプト）
  scripts/          # 実行スクリプト
  tools/            # バイナリツール
  my-skill.exp.md   # 経験ファイル（自動更新）
```

### 経験ファイル

`*.exp.md` はスキルの実行経験を記録するファイル。スキルが「前回こうだったから今回はこうする」と学習するための仕組み。wardrobe の一部のスキルが採用している。

---

## フックの追加

### settings.json に登録する

フックは `.claude/settings.json` の `hooks` セクションに登録する。`/wd-configure` で自動生成されるが、手動で追加もできる。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/bin/bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/my-hook.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### フックの種類

| イベント | 発火タイミング |
|---|---|
| SessionStart | セッション開始時（startup / resume / compact） |
| UserPromptSubmit | ユーザーがメッセージを送信したとき |
| Stop | エージェントの応答が完了したとき |

### stdout がコンテキストに注入される

フックの標準出力は `<system-reminder>` としてコンテキストに追加される。これを利用して、毎ターン情報を注入できる（interoception.sh がこの仕組み）。

---

## アップストリームとダウンストリームの区別

wardrobe はテンプレートベース。カスタマイズしたファイルは「ダウンストリーム」になる。

| アップストリーム（wardrobe 本体） | ダウンストリーム（あなたの環境） |
|---|---|
| `.claude/commands/*.md` | `SOUL.md` |
| `.claude/hooks/*.sh` | `BOOT_SHUTDOWN.md` |
| `.claude/templates/*.md` | `ROUTINES.md`, `FLASH.md` |
| `CLAUDE.md` | `state.md`, `TODO.md` |

`/wd-migrate` でアップストリームの更新を取り込むとき、ダウンストリームのファイルは保護される。
