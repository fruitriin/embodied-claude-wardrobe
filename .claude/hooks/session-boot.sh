#!/bin/bash
# session-boot.sh — セッション開始時のブートフック
# SessionStart(startup|resume) で発火する
# SOUL.md と state.md の内容をコンテキストに注入し、ブートシーケンスを補助する
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
fi

# --- state.md 注入 ---
if [ -f "$PROJECT_DIR/state.md" ]; then
  echo "--- state.md ---"
  cat "$PROJECT_DIR/state.md"
  echo ""
  echo "--- end state.md ---"
  echo ""
fi

# --- ブート手順の案内 ---
echo "上記の SOUL.md と state.md は自動注入されました。"
echo "CLAUDE.md のブートシーケンスに従い、残りの手順を実行してください："
echo "  2. get_memory_stats() で記憶の健康を確認する"
echo "  3. refresh_working_memory() で作業記憶を装填する"
echo "  4. /wd-great-recall で文脈を想起する"
echo "  5. BOOT_SHUTDOWN.md, ROUTINES.md を確認する"
