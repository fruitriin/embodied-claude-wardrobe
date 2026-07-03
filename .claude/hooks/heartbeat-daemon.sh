#!/bin/bash
# heartbeat-daemon.sh - 心拍デーモン
# 5秒ごとにlaunchdで実行され、体の状態を interoception_state.json に書き出す
# interoception.sh (UserPromptSubmitフック) がこのファイルを読んでコンテキストに注入する
#
# 実装メモ:
#   以前は bash 変数を python -c の文字列に直接埋め込んでいた。state file の値に
#   `'` などが混入すると Python が SyntaxError を投げ、`2>/dev/null` が握りつぶすため
#   デーモンは何事もなかったかのように「壊れた state を読んで書けずに終わる」を
#   永久に繰り返した（attacker 実証済み）。
#   本版では bash は環境変数を用意するだけで、JSON の読み書き・エラー処理はすべて
#   単一の Python スクリプトが行う。state file の中身がどれだけ壊れていても、
#   Python 側で捕捉して「window を空にリセット + 新エントリを追加」で完走する。

STATE_FILE="${CLAUDE_CODE_TMPDIR:-/tmp}/interoception_state.json"
WINDOW_SIZE=12  # 直近12エントリ（5秒×12=1分間）

# --- 時刻 ---
CURRENT_TIME=$(date '+%Y-%m-%dT%H:%M:%S%z')
HOUR=$(date '+%H')

if [ "$HOUR" -ge 5 ] && [ "$HOUR" -lt 10 ]; then
    PHASE="morning"
elif [ "$HOUR" -ge 10 ] && [ "$HOUR" -lt 12 ]; then
    PHASE="late_morning"
elif [ "$HOUR" -ge 12 ] && [ "$HOUR" -lt 14 ]; then
    PHASE="midday"
elif [ "$HOUR" -ge 14 ] && [ "$HOUR" -lt 17 ]; then
    PHASE="afternoon"
elif [ "$HOUR" -ge 17 ] && [ "$HOUR" -lt 20 ]; then
    PHASE="evening"
elif [ "$HOUR" -ge 20 ] && [ "$HOUR" -lt 23 ]; then
    PHASE="night"
else
    PHASE="late_night"
fi

# --- メモリ ---
MEM_PRESSURE=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage" | awk '{print $NF}' | tr -d '%')
if [ -z "$MEM_PRESSURE" ]; then
    MEM_PRESSURE="0"
fi

# --- 体温 ---
THERMAL=$(sysctl -n machdep.xcpm.cpu_thermal_level 2>/dev/null || echo "0")

# --- 稼働時間（分） ---
BOOT_TIME=$(sysctl -n kern.boottime 2>/dev/null | awk '{print $4}' | tr -d ',')
if [ -n "$BOOT_TIME" ]; then
    NOW_EPOCH=$(date +%s)
    UPTIME_MIN=$(( (NOW_EPOCH - BOOT_TIME) / 60 ))
else
    UPTIME_MIN=0
fi

# --- Python に丸ごと委譲（環境変数経由） ---
export HB_STATE_FILE="$STATE_FILE"
export HB_WINDOW_SIZE="$WINDOW_SIZE"
export HB_CURRENT_TIME="$CURRENT_TIME"
export HB_PHASE="$PHASE"
export HB_THERMAL="${THERMAL:-0}"
export HB_MEM_FREE="${MEM_PRESSURE:-0}"
export HB_UPTIME_MIN="${UPTIME_MIN:-0}"

python3 - <<'PYEOF'
import json
import os
import sys
import tempfile

state_file = os.environ["HB_STATE_FILE"]
window_size = int(os.environ.get("HB_WINDOW_SIZE", "12"))

def to_num(env_key, default=0):
    raw = os.environ.get(env_key, str(default))
    try:
        return int(raw)
    except ValueError:
        try:
            return float(raw)
        except ValueError:
            return default

current_time = os.environ["HB_CURRENT_TIME"]
phase = os.environ["HB_PHASE"]
thermal = to_num("HB_THERMAL", 0)
mem_free = to_num("HB_MEM_FREE", 0)
uptime_min = to_num("HB_UPTIME_MIN", 0)

# 既存 window を安全に読む。壊れていれば空にリセット。
window = []
try:
    with open(state_file) as f:
        data = json.load(f)
    raw_window = data.get("window", [])
    if isinstance(raw_window, list):
        # 各エントリは dict であるべき。壊れたものは捨てる。
        window = [e for e in raw_window if isinstance(e, dict)]
except FileNotFoundError:
    pass
except Exception as e:
    # JSON 破損・IO エラー等はログして続行（フェイルオープン）
    print(f"heartbeat-daemon: state read failed, resetting window: {e}",
          file=sys.stderr)
    window = []

# 直近 WINDOW_SIZE-1 エントリだけ保持
if window_size > 1:
    window = window[-(window_size - 1):]

# 新エントリを追加
new_entry = {
    "ts": current_time,
    "mem_free": mem_free,
    "thermal": thermal,
}
window.append(new_entry)

def trend(values):
    if len(values) < 3:
        return "stable"
    recent = values[-3:]
    diff = recent[-1] - recent[0]
    if diff > 5:
        return "rising"
    if diff < -5:
        return "falling"
    return "stable"

mem_vals = [e.get("mem_free", 0) for e in window if isinstance(e.get("mem_free"), (int, float))]

result = {
    "now": {
        "ts": current_time,
        "phase": phase,
        "thermal": thermal,
        "mem_free": mem_free,
        "uptime_min": uptime_min,
    },
    "window": window,
    "trend": {
        "mem_free": trend(mem_vals),
    },
}

# アトミック書き出し（同一ディレクトリで tempfile → rename）
state_dir = os.path.dirname(state_file) or "."
os.makedirs(state_dir, exist_ok=True)
fd, tmp_path = tempfile.mkstemp(prefix=".heartbeat.", dir=state_dir)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, state_file)
except Exception:
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    raise
PYEOF
