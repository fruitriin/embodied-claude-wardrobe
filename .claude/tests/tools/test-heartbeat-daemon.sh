#!/bin/bash
# test-heartbeat-daemon.sh
# heartbeat-daemon.sh の耐久性テスト。
# 過去に発見された「state file の値に `'` が混入するとシェル展開で SyntaxError が起き、
# 2>/dev/null で握りつぶされて永久停止する」構造欠陥の非退行を保証する。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DAEMON="$PROJECT_DIR/.claude/hooks/heartbeat-daemon.sh"
PASS=0
FAIL=0

echo "=== test-heartbeat-daemon.sh ==="

if [ ! -x "$DAEMON" ]; then
  echo "  FAIL: daemon not executable: $DAEMON"
  exit 1
fi

# 一時ディレクトリを本テスト専用に用意
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_daemon_with_state() {
  # $1: テスト名, $2: 初期 state file の中身（空なら state file 未作成）
  local name="$1" initial="$2"
  local tmpdir
  tmpdir="$(mktemp -d -p "$TMP_ROOT")"
  local state_file="$tmpdir/interoception_state.json"
  if [ -n "$initial" ]; then
    printf '%s' "$initial" > "$state_file"
  fi
  # 標準エラーはキャプチャして目視確認用にログへ流す
  local stderr_log="$tmpdir/stderr.log"
  CLAUDE_CODE_TMPDIR="$tmpdir" bash "$DAEMON" 2> "$stderr_log"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "  FAIL: $name — daemon exited with rc=$rc"
    sed 's/^/    stderr: /' "$stderr_log" 1>&2 || true
    FAIL=$((FAIL + 1))
    return 1
  fi
  if [ ! -s "$state_file" ]; then
    echo "  FAIL: $name — state file was not written"
    FAIL=$((FAIL + 1))
    return 1
  fi
  # 有効な JSON か + window に最低1エントリあるか
  if ! python3 -c "
import json, sys
with open('$state_file') as f:
    data = json.load(f)
assert isinstance(data, dict), 'top-level not dict'
assert isinstance(data.get('window'), list), 'window not list'
assert len(data['window']) >= 1, 'window is empty'
assert isinstance(data.get('now'), dict), 'now not dict'
" 2>/dev/null; then
    echo "  FAIL: $name — output JSON invalid or window empty"
    FAIL=$((FAIL + 1))
    return 1
  fi
  echo "  PASS: $name"
  PASS=$((PASS + 1))
  return 0
}

# --- Test 1: 正常系（state file 未存在） ---
echo "Test 1: fresh start (no existing state file)"
run_daemon_with_state "fresh-start" ""

# --- Test 2: apostrophe (attacker が実証した破損パターン) ---
echo "Test 2: apostrophe in window entry (past regression)"
run_daemon_with_state "apostrophe" \
  '{"window":[{"ts":"O'"'"'Brien said hi","arousal":10,"mem_free":50,"thermal":0}]}'

# --- Test 3: double quote in value ---
echo 'Test 3: double quote in window entry'
run_daemon_with_state "double-quote" \
  '{"window":[{"ts":"say \"hello\"","mem_free":50,"thermal":0}]}'

# --- Test 4: backslash in value ---
echo "Test 4: backslash in window entry"
run_daemon_with_state "backslash" \
  '{"window":[{"ts":"path\\\\to\\\\file","mem_free":50,"thermal":0}]}'

# --- Test 5: 完全な JSON 破損（デーモンは落ちず、リセットして続行すべき） ---
echo "Test 5: totally corrupted JSON (should reset and continue)"
run_daemon_with_state "corrupted" 'this is not json at all }}}'

# --- Test 6: window に dict 以外の要素が混入（防衛的にフィルタされるべき） ---
echo "Test 6: window contains non-dict entries"
run_daemon_with_state "non-dict-in-window" \
  '{"window":[null, "string", 42, {"ts":"ok","mem_free":50,"thermal":0}]}'

# --- Test 7: 連続実行で window が伸びる ---
echo "Test 7: repeated runs accumulate window entries"
tmpdir7="$(mktemp -d -p "$TMP_ROOT")"
for _ in 1 2 3; do
  CLAUDE_CODE_TMPDIR="$tmpdir7" bash "$DAEMON" >/dev/null 2>&1
done
count=$(python3 -c "import json; print(len(json.load(open('$tmpdir7/interoception_state.json'))['window']))" 2>/dev/null)
if [ "$count" = "3" ]; then
  echo "  PASS: window grew to 3 entries after 3 runs"
  PASS=$((PASS + 1))
else
  echo "  FAIL: expected 3 entries, got '$count'"
  FAIL=$((FAIL + 1))
fi

# --- Test 8: WINDOW_SIZE の上限が守られる（12 でクリップされる） ---
echo "Test 8: window is capped at WINDOW_SIZE (12)"
tmpdir8="$(mktemp -d -p "$TMP_ROOT")"
# 20 個の合成エントリを詰めた state file を用意
python3 -c "
import json
entries = [{'ts': f'2026-07-04T00:00:{i:02d}+0900', 'mem_free': 50, 'thermal': 0} for i in range(20)]
json.dump({'window': entries}, open('$tmpdir8/interoception_state.json', 'w'))
"
CLAUDE_CODE_TMPDIR="$tmpdir8" bash "$DAEMON" >/dev/null 2>&1
count8=$(python3 -c "import json; print(len(json.load(open('$tmpdir8/interoception_state.json'))['window']))" 2>/dev/null)
if [ "$count8" = "12" ]; then
  echo "  PASS: window capped at 12 (was 20)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: expected 12 entries after cap, got '$count8'"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "--- Result: $PASS passed, $FAIL failed ---"
if [ "$FAIL" -eq 0 ]; then
  exit 0
else
  exit 1
fi
