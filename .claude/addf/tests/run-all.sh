#!/bin/bash
# run-all.sh
# フック・ツールの自動テストを一括実行する。
# スキルテストは自然言語シナリオのため手動実行（.claude/addf/tests/skills/ を参照）。
#
# 設計ガイドライン（ダウンストリームでテストを追加する場合も同様）:
# - テストが依存する必須ランタイム（bun / uv / python3 等）の不在を SKIP=成功として
#   扱わない。環境起因で実行できないことと、テストが通ったことは別物として区別する。
#   ランタイム不在で 0 件実行のまま ✓ を返す構造にしないこと（ダウンストリーム実例:
#   cron の PATH 落ちで bun 不在 → 74 テストが 0 件実行のまま「All passed」を返した）
#   良い例: command -v bun >/dev/null || { echo "FAIL: bun が必要（インストールしてから再実行）"; exit 1; }
# - 環境的に実行不能なテスト（例: macOS 専用バイナリの非 macOS 実行）を飛ばす場合は、
#   SKIP を明示出力し、件数を Results 行に含める（例: test-tools.sh の
#   「Results: N passed, N failed, N skipped」）。silent に読み飛ばさない

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
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

# ワードローブ固有ツールテスト（.claude/addf/ 占有空間外に退避済み）
echo ""
echo "▶ Tool Tests (wardrobe)"
for f in "$PROJECT_ROOT"/.claude/wardrobeTests/tools/test-*.sh; do
  [ -f "$f" ] && run_test "$f"
done

# Bun バイナリの実体を検証する（PATH 汚染攻撃対策）
# 戻り値: 0=本物 / 1=偽者（PATH 上の別実行ファイル） / 2=不在
verify_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    return 2
  fi
  local ver
  ver=$(bun --version 2>/dev/null) || return 1
  # semver パターン（例: "1.3.5"）にマッチしなければ bun ではない実行ファイルが PATH 上にある
  if ! printf '%s' "$ver" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+.].*)?$'; then
    return 1
  fi
  return 0
}

# Bun テスト（ワードローブ追加: .claude 配下の *.test.ts を一括発見）
echo ""
echo "▶ Bun Tests (wardrobe)"
BUN_TESTS=$(find "$PROJECT_ROOT/.claude" -name '*.test.ts' -not -path '*/node_modules/*' 2>/dev/null)
BUN_STATUS=""
BUN_PASS=0
BUN_FAIL=0

verify_bun
BUN_STATE=$?

if [ "$BUN_STATE" -eq 0 ]; then
  if [ -n "$BUN_TESTS" ]; then
    while IFS= read -r f; do
      echo ""
      echo "━━━ $(basename "$f") ━━━"
      # emotion-mcp 等サブプロジェクトのテストは package.json のあるディレクトリで実行
      pkg_dir="$(dirname "$f")"
      while [ "$pkg_dir" != "$PROJECT_ROOT" ] && [ ! -f "$pkg_dir/package.json" ]; do pkg_dir="$(dirname "$pkg_dir")"; done
      if [ -f "$pkg_dir/package.json" ]; then run_dir="$pkg_dir"; else run_dir="$PROJECT_ROOT"; fi
      # 出力を捕捉して bun 特有のシグネチャを二重チェック（PATH 汚染の二段目防御）
      bun_output=$(cd "$run_dir" && bun test "$f" 2>&1)
      bun_rc=$?
      printf '%s\n' "$bun_output"
      if ! printf '%s' "$bun_output" | grep -Eq 'bun test v[0-9]+\.[0-9]+'; then
        echo "→ $(basename "$f"): FAILED (bun output missing signature — PATH 汚染の疑い)"
        BUN_FAIL=$((BUN_FAIL + 1))
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
      elif [ "$bun_rc" -eq 0 ]; then
        echo "→ $(basename "$f"): ALL PASSED"
        BUN_PASS=$((BUN_PASS + 1))
      else
        echo "→ $(basename "$f"): SOME FAILED"
        BUN_FAIL=$((BUN_FAIL + 1))
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
      fi
    done <<< "$BUN_TESTS"
    BUN_STATUS="Bun tests: ${BUN_PASS} file(s) passed / ${BUN_FAIL} file(s) failed"
  else
    # 旧仕様では bun 不在は常に SKIP だったが、cron の PATH 落ちを検知するため区別した
    echo "  （*.test.ts なし — 真の SKIP）"
    BUN_STATUS="Bun tests: SKIPPED (no *.test.ts files)"
  fi
elif [ "$BUN_STATE" -eq 1 ]; then
  # bun がヒットしたが --version が semver で応えない: PATH 上に偽物がいる
  echo "  ✗ bun バイナリを拒否: --version の出力が semver パターンに一致しない"
  echo "  → FAIL 扱いにする（PATH 汚染攻撃または壊れた bun）"
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
  BUN_STATUS="Bun tests: FAILED (bun binary rejected: version output did not match)"
else
  # bun 完全不在
  if [ -n "$BUN_TESTS" ]; then
    BUN_COUNT=$(printf '%s\n' "$BUN_TESTS" | wc -l | tr -d ' ')
    echo "  ✗ bun が見つからないが *.test.ts が ${BUN_COUNT} 件実在する（cron の PATH 落ちの可能性）"
    echo "  → FAIL 扱いにする"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    BUN_STATUS="Bun tests: FAILED (bun not found, ${BUN_COUNT} test file(s) exist)"
  else
    # 旧仕様では bun 不在は常に SKIP だったが、cron の PATH 落ちを検知するため区別した
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
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "✓ All automated tests passed"
  exit 0
else
  echo "✗ $TOTAL_FAIL test suite(s) had failures"
  exit 1
fi
