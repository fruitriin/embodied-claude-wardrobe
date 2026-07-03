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
if command -v bun >/dev/null 2>&1; then
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  BUN_TESTS=$(find "$PROJECT_ROOT/.claude" -name '*.test.ts' -not -path '*/node_modules/*' 2>/dev/null)
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
    done <<< "$BUN_TESTS"
  else
    echo "  （*.test.ts なし — SKIP）"
  fi
else
  echo "  （bun 不在 — SKIP）"
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
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "✓ All automated tests passed"
  exit 0
else
  echo "✗ $TOTAL_FAIL test suite(s) had failures"
  exit 1
fi
