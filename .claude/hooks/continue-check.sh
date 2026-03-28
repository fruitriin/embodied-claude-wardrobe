#!/bin/bash
# ── 常設聞き耳モジュール ──────────────────────────
# このファイルは聴覚モジュールの一部です。関連ファイル:
#   .claude/hooks/hearing-hook.sh      — 聴覚開始フック
#   .claude/hooks/hearing-stop-hook.sh — 聴覚停止フック
#   .claude/hooks/hearing-daemon.py    — 聴覚デーモン（常駐プロセス）
#   .claude/hooks/continue-check.sh   — 継続判定  ← このファイル
# ──────────────────────────────────────────────────
# continue-check.sh — Heartbeat の心残りチェック（Stop hook）
#
# セッション終了時に last_assistant_message を確認し、
# [CONTINUE: ...] があれば decision block でターンを延長する。
# [DONE] または MAX_CONTINUES 到達で終了。
#
# 対話セッションでは HEARTBEAT 環境変数がないため即 exit。

# --- 対話セッション除外 ---
[ "$HEARTBEAT" != "1" ] && exit 0

COUNTER_FILE="${CLAUDE_CODE_TMPDIR:-/tmp}/heartbeat-continue-counter"
MAX_CONTINUES=${MAX_CONTINUES:-3}
LOG_FILE="${CLAUDE_CODE_TMPDIR:-/tmp}/heartbeat-continue.log"

# stdin から JSON を読む
INPUT=$(cat)

# last_assistant_message を抽出
LAST_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // ""' 2>/dev/null)

# カウンタ読み込み
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)

# [CONTINUE: ...] パターンを検出
CONTINUE_MSG=$(echo "$LAST_MSG" | sed -n 's/.*\[CONTINUE: \(.*\)\].*/\1/p' | head -1)

# [DONE] パターンを検出
HAS_DONE=$(echo "$LAST_MSG" | grep -c '\[DONE\]')

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$HAS_DONE" -gt 0 ] || [ -z "$CONTINUE_MSG" ]; then
  # 心残りなし or 明示的に完了
  rm -f "$COUNTER_FILE"
  echo "[$TIMESTAMP] DONE (chain=$COUNT)" >> "$LOG_FILE"
  exit 0
fi

if [ "$COUNT" -ge "$MAX_CONTINUES" ]; then
  # チェイン上限到達
  rm -f "$COUNTER_FILE"
  echo "[$TIMESTAMP] MAX_REACHED (chain=$COUNT/$MAX_CONTINUES) reason=$CONTINUE_MSG" >> "$LOG_FILE"
  exit 0
fi

# チェイン延長
echo $((COUNT + 1)) > "$COUNTER_FILE"
echo "[$TIMESTAMP] BLOCK (chain=$((COUNT+1))/$MAX_CONTINUES) reason=$CONTINUE_MSG" >> "$LOG_FILE"

# reason に JSON エスケープ
ESCAPED=$(echo "$CONTINUE_MSG" | sed 's/"/\\"/g')
echo "{\"decision\": \"block\", \"reason\": \"前のターンからの続き（チェイン$((COUNT+1))/${MAX_CONTINUES}）: ${ESCAPED}\"}"
