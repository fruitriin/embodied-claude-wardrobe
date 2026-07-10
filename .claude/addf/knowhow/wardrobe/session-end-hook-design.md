# SessionEnd フックの設計

## わかったこと

- Claude Code の `SessionEnd` フックはデフォルトタイムアウト **1.5秒**
- `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` で延長可能だが、セッション終了が遅くなる
- `type: prompt` / `type: agent` は理論上使えるが、1.5秒では実行しきれない
- 入力に `transcript_path`（セッションのトランスクリプトファイルパス）が含まれる
- 決定制御なし（ブロック不可）

## やり方

### 方式: nohup + バックグラウンド Claude 起動

SessionEnd フックから Claude の子プロセスを fire-and-forget で起動する。
autonomous-action.sh と同じパターン。

```bash
#!/bin/bash
INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd')

# バックグラウンドで Claude を起動して即座に返る
nohup claude -p "セッション終了処理:
1. $TRANSCRIPT を読んでセッションを要約
2. memory-mcp に要約を書き込む
3. FLASH.md を更新
4. 必要なら state.md を更新" \
  --cwd "$PROJECT_DIR" \
  &>/dev/null &

exit 0
```

### 代替案: at コマンド

```bash
echo "claude -p '...' --cwd '$PROJECT_DIR'" | at now
```

- macOS では `atrun` デーモンの有効化が必要
- `sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.atrun.plist`

## 気をつけること

- セッション終了後に MCP サーバーが落ちている可能性がある
  - 子プロセスの Claude は新しいセッションとして MCP を自分で立ち上げる
- transcript_path のファイルが大きい場合、要約生成に時間がかかる
- バックグラウンドプロセスが残り続けないよう、タイムアウトを設ける
- 同時に複数のセッション終了処理が走る可能性（排他制御が必要かもしれない）

## 参照

- [Hooks reference](https://code.claude.com/docs/en/hooks) — SessionEnd の仕様
- `autonomous-action.sh` — nohup + バックグラウンド起動の実績あるパターン
