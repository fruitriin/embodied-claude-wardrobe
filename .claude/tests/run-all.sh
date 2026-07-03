#!/bin/bash
# run-all.sh
# フック・ツールの自動テストを一括実行する。
# スキルテストは自然言語シナリオのため手動実行（.claude/tests/skills/ を参照）。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0

run_test() {
  local test_file="$1"
  local name="$(basename "$test_file")"
  echo ""
  echo "━━━ $name ━━━"
  if bash "$test_file"; then
    echo "→ $name: ALL PASSED"
  else
    echo "→ $name: SOME FAILED"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
}

echo "╔══════════════════════════════════════╗"
echo "║  ADDF Framework Test Runner          ║"
echo "╚══════════════════════════════════════╝"

# フックテスト
echo ""
echo "▶ Hook Tests"
for f in "$SCRIPT_DIR"/hooks/test-*.sh; do
  [ -f "$f" ] && run_test "$f"
done

# ツールテスト
echo ""
echo "▶ Tool Tests"
for f in "$SCRIPT_DIR"/tools/test-*.sh; do
  [ -f "$f" ] && run_test "$f"
done

# Bun テスト（ワードローブ追加: .claude 配下の *.test.ts を一括発見）
echo ""
echo "▶ Bun Tests (wardrobe)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUN_TESTS=$(find "$PROJECT_ROOT/.claude" -name '*.test.ts' -not -path '*/node_modules/*' 2>/dev/null)
BUN_STATUS=""
BUN_EXECUTED=0
if command -v bun >/dev/null 2>&1; then
  if [ -n "$BUN_TESTS" ]; then
    while IFS= read -r f; do
      echo ""
      echo "━━━ $(basename "$f") ━━━"
      # emotion-mcp 等サブプロジェクトのテストは package.json のあるディレクトリで実行
      pkg_dir="$(dirname "$f")"
      while [ "$pkg_dir" != "$PROJECT_ROOT" ] && [ ! -f "$pkg_dir/package.json" ]; do pkg_dir="$(dirname "$pkg_dir")"; done
      if [ -f "$pkg_dir/package.json" ]; then run_dir="$pkg_dir"; else run_dir="$PROJECT_ROOT"; fi
      if (cd "$run_dir" && bun test "$f"); then
        echo "→ $(basename "$f"): ALL PASSED"
      else
        echo "→ $(basename "$f"): SOME FAILED"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
      fi
      BUN_EXECUTED=$((BUN_EXECUTED + 1))
    done <<< "$BUN_TESTS"
    BUN_STATUS="Bun tests: ${BUN_EXECUTED} executed"
  else
    echo "  （*.test.ts なし — 真の SKIP）"
    BUN_STATUS="Bun tests: SKIPPED (no *.test.ts files)"
  fi
else
  # bun 不在: テストファイルが実在するなら FAIL 扱い（cron の PATH 落ちで無音 SKIP を防ぐ）
  if [ -n "$BUN_TESTS" ]; then
    BUN_COUNT=$(printf '%s\n' "$BUN_TESTS" | wc -l | tr -d ' ')
    echo "  ✗ bun が見つからないが *.test.ts が ${BUN_COUNT} 件実在する（cron の PATH 落ちの可能性）"
    echo "  → FAIL 扱いにする"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    BUN_STATUS="Bun tests: FAILED (bun not found, ${BUN_COUNT} test file(s) exist)"
  else
    echo "  （bun 不在 かつ *.test.ts なし — 真の SKIP）"
    BUN_STATUS="Bun tests: SKIPPED (bun not found, no *.test.ts files)"
  fi
fi

# メモ: memory-mcp の pytest（約4.5分、E5モデル実ロード）は重いため本ランナーには含めない。
# 実行: cd .claude/mcps/memory-mcp && uv run pytest

# スキルテスト案内
echo ""
echo "▶ Skill Tests (manual)"
echo "  スキルテストは自然言語シナリオです。手動で実行してください:"
for f in "$SCRIPT_DIR"/skills/test-*.md; do
  [ -f "$f" ] && echo "  - $(basename "$f")"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ Summary"
echo "  ${BUN_STATUS}"
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "✓ All automated tests passed"
  exit 0
else
  echo "✗ $TOTAL_FAIL test suite(s) had failures"
  exit 1
fi
