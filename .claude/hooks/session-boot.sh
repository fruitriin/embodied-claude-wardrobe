#!/bin/bash
# session-boot.sh — セッション開始時の身支度フック
# SessionStart(startup|resume) で発火する
# SOUL.md と state.md の内容をコンテキストに注入し、BOOT_SHUTDOWN.md の身支度手順を案内する
# stdout の内容がコンテキストに追加される

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# --- matcher を JSON stdin から取得 ---
INPUT=$(cat)
MATCHER=$(echo "$INPUT" | grep -o '"matcher":"[^"]*"' | head -1 | cut -d'"' -f4 2>/dev/null)

echo "[session-boot] type=${MATCHER:-unknown}"
echo ""

# --- SOUL.md 注入 ---
if [ -f "$PROJECT_DIR/SOUL.md" ]; then
  echo "--- SOUL.md ---"
  cat "$PROJECT_DIR/SOUL.md"
  echo ""
  echo "--- end SOUL.md ---"
  echo ""
else
  echo "[SOUL.md が見つかりません。/wd-setup を実行してください]"
  echo ""
fi

# --- state.md 注入 ---
if [ -f "$PROJECT_DIR/state.md" ]; then
  echo "--- state.md ---"
  cat "$PROJECT_DIR/state.md"
  echo ""
  echo "--- end state.md ---"
  echo ""
fi

# --- 身支度の案内 ---
echo "SOUL.md と state.md は自動注入済み。BOOT_SHUTDOWN.md の身支度手順に従い、残りを実行してください。"
