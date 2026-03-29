#!/bin/bash
# Claude 自律行動スクリプト（macOS版）
# 20分ごとにcronで実行、時間帯に応じて間引く
#
# crontab -e で以下を追加:
# */20 * * * * /path/to/embodied-claude-wardrobe/autonomous-action.sh
#
# Usage:
#   autonomous-action.sh                                    # 通常実行（cron）
#   autonomous-action.sh --test-prompt FILE                 # プロンプト差し替え（スケジュール制御スキップ）
#   autonomous-action.sh --date "2026-02-20 14:30"          # 日時を注入（スケジュール制御テスト）
#   autonomous-action.sh --force-routine                    # ルーチン回を強制
#   autonomous-action.sh --force-normal                     # 通常回を強制
#   autonomous-action.sh --dry-run                          # claude -p を実行せずプロンプトを表示
#   autonomous-action.sh -p "任意のプロンプト"               # プロンプト直接指定（スケジュール制御スキップ）
#   autonomous-action.sh --dry-run --date "2026-02-20 03:00" --force-routine  # 組み合わせ可
#   autonomous-action.sh --slack --session-id UUID --model sonnet --settings PATH -p "message"  # Slack経由（webhook.tsから呼出）

export HOME="${HOME:-/Users/$(whoami)}"
export PATH="${HOME}/.asdf/shims:/opt/homebrew/bin:${PATH:-/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

set -a
source "$SCRIPT_DIR/.env"
set +a

# --- 引数パース ---
TEST_PROMPT_FILE=""
TEST_PROMPT_STRING=""
OVERRIDE_DATE=""
FORCE_ROUTINE=""    # "", "routine", "normal"
DRY_RUN=false
SLACK_MODE=false
SLACK_SESSION_ID=""
SLACK_SESSION_TYPE=""
SLACK_MODEL=""
SLACK_SETTINGS=""
SLACK_SYSTEM_PROMPT=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p)
      TEST_PROMPT_STRING="$2"
      shift 2
      ;;
    --test-prompt)
      TEST_PROMPT_FILE="$2"
      shift 2
      ;;
    --date)
      OVERRIDE_DATE="$2"
      shift 2
      ;;
    --force-routine)
      FORCE_ROUTINE="routine"
      shift
      ;;
    --force-normal)
      FORCE_ROUTINE="normal"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --slack)
      SLACK_MODE=true
      shift
      ;;
    --session-id)
      SLACK_SESSION_ID="$2"
      SLACK_SESSION_TYPE="new"
      shift 2
      ;;
    --resume)
      SLACK_SESSION_ID="$2"
      SLACK_SESSION_TYPE="resume"
      shift 2
      ;;
    --model)
      SLACK_MODEL="$2"
      shift 2
      ;;
    --settings)
      SLACK_SETTINGS="$2"
      shift 2
      ;;
    --system-prompt)
      SLACK_SYSTEM_PROMPT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# --- 日時の決定 ---
if [ -n "$OVERRIDE_DATE" ]; then
  HOUR=$((10#$(date -j -f "%Y-%m-%d %H:%M" "$OVERRIDE_DATE" +%H 2>/dev/null || date -d "$OVERRIDE_DATE" +%H)))
  MINUTE=$((10#$(date -j -f "%Y-%m-%d %H:%M" "$OVERRIDE_DATE" +%M 2>/dev/null || date -d "$OVERRIDE_DATE" +%M)))
else
  HOUR=$((10#$(date +%H)))
  MINUTE=$((10#$(date +%M)))
fi

# timeout コマンド検出（GNU coreutils or macOS built-in）
TIMEOUT_CMD=$(which timeout 2>/dev/null || which gtimeout 2>/dev/null)

LOG_DIR="$SCRIPT_DIR/workingLogs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"
echo "LOG: $LOG_FILE"

# 古いログを掃除（1日以上前）
find "$LOG_DIR" -name "*.log" -mtime +1 -delete 2>/dev/null

echo "=== 自律行動開始: $(date) ===" >> "$LOG_FILE"
if [ -n "$OVERRIDE_DATE" ]; then
  echo "[日時オーバーライド] $OVERRIDE_DATE (HOUR=$HOUR, MINUTE=$MINUTE)" >> "$LOG_FILE"
fi
if [ -n "$TEST_PROMPT_FILE" ]; then
  echo "[テストモード] プロンプト: $TEST_PROMPT_FILE" >> "$LOG_FILE"
fi

# ===== Layer 2: zombie hunter =====
kill_zombie_claude() {
  local ZOMBIE_THRESHOLD_MIN=25
  local zombie_list pid etime elapsed_min hh mm
  zombie_list=$(ps -eo pid=,etime=,command= 2>/dev/null | grep claude | grep -v grep | grep "$(basename "$SCRIPT_DIR")" | grep -v "remote-control" | while read zpid zetime zrest; do echo "$zpid $zetime"; done)
  if [ -z "$zombie_list" ]; then return 0; fi
  while IFS= read -r proc_line; do
    pid=$(echo "$proc_line" | cut -d" " -f1)
    etime=$(echo "$proc_line" | cut -d" " -f2)
    [ -z "$pid" ] && continue
    elapsed_min=0
    case "$etime" in
      *-*)  elapsed_min=9999 ;;
      *:*:*)
        hh=$(echo "$etime" | cut -d: -f1)
        mm=$(echo "$etime" | cut -d: -f2)
        elapsed_min=$(( 10#${hh:-0} * 60 + 10#${mm:-0} )) ;;
      *)
        mm=$(echo "$etime" | cut -d: -f1)
        elapsed_min=$(( 10#${mm:-0} )) ;;
    esac
    if [ "$elapsed_min" -ge "$ZOMBIE_THRESHOLD_MIN" ]; then
      echo "[$(date +%Y-%m-%d_%H:%M:%S)] ZOMBIE_KILLED: PID=$pid etime=$etime (${elapsed_min}min >= ${ZOMBIE_THRESHOLD_MIN}min)" >> "$LOG_FILE"
      kill -9 "$pid" 2>/dev/null
    fi
  done << ZHEOF
$zombie_list
ZHEOF
}

# Layer 2: zombie hunter
kill_zombie_claude


# --- 休日・休暇判定 ---
SCHEDULE_CONF="$SCRIPT_DIR/schedule.conf"
IS_HOLIDAY=false
IS_VACATION=false
if [ -f "$SCHEDULE_CONF" ]; then
  source "$SCHEDULE_CONF"

  # 曜日判定（0=日, 6=土）
  if [ -n "$OVERRIDE_DATE" ]; then
    DOW=$(date -j -f "%Y-%m-%d %H:%M" "$OVERRIDE_DATE" +%w 2>/dev/null || date -d "$OVERRIDE_DATE" +%w)
    TODAY_MMDD=$(date -j -f "%Y-%m-%d %H:%M" "$OVERRIDE_DATE" +%m-%d 2>/dev/null || date -d "$OVERRIDE_DATE" +%m-%d)
  else
    DOW=$(date +%w)
    TODAY_MMDD=$(date +%m-%d)
  fi

  # 曜日が休日リストに含まれるか
  if echo ",$HOLIDAY_WEEKDAYS," | grep -q ",$DOW,"; then
    IS_HOLIDAY=true
  fi

  # 日付が祝日リストに含まれるか
  if [ -n "$HOLIDAY_DATES" ] && echo ",$HOLIDAY_DATES," | grep -q ",$TODAY_MMDD,"; then
    IS_HOLIDAY=true
  fi

  # 日付が休暇リストに含まれるか（休暇 = 活動頻度を下げる）
  if [ -n "$VACATION_DATES" ] && echo ",$VACATION_DATES," | grep -q ",$TODAY_MMDD,"; then
    IS_VACATION=true
  fi
fi

# --- スケジュール制御（claude到達前に早期リターン） ---
# テストモードではスキップ。dry-run は --date 指定時のみスケジュール制御を通す
# 通常日:
#   密（20分間隔で毎回実行）: 7-8時, 12-13時, 18-24時
#   昼間それ以外（毎時:00のみ, 50%）: 8-12時, 13-18時
#   深夜（毎時:00のみ, 10%）: 0-7時
# 休日: 7-24時がすべてアクティブ帯（20分おき毎回実行）
# 休暇: 全帯域60分間隔（毎時:00のみ）、ルーチン確率UP

SKIP_SCHEDULE=false
if [ -n "$TEST_PROMPT_FILE" ] || [ -n "$TEST_PROMPT_STRING" ]; then
  SKIP_SCHEDULE=true
elif [ "$DRY_RUN" = true ] && [ -z "$OVERRIDE_DATE" ]; then
  SKIP_SCHEDULE=true
fi

# ===== 就寝前ヘルスチェック (22-23時台に自動実行) =====
if [ "$SKIP_SCHEDULE" = false ] && { [ "$HOUR" -eq 22 ] || [ "$HOUR" -eq 23 ]; }; then
  BEDTIME_TS=$(date +%Y-%m-%d_%H:%M:%S)
  echo "[$BEDTIME_TS] BEDTIME_HEALTH: 就寝前ヘルスチェック実行" >> "$LOG_FILE"
  bun run "$SCRIPT_DIR/.claude/scripts/system-health.ts" --notify >> "$LOG_FILE" 2>&1 || \
    echo "[$BEDTIME_TS] BEDTIME_HEALTH: 通知失敗" >> "$LOG_FILE"
fi

if [ "$SKIP_SCHEDULE" = false ]; then
  IS_ACTIVE=false

  if [ "$IS_VACATION" = true ]; then
    # 休暇モード: 全帯域60分間隔（毎時:00のみ）
    if [ "$MINUTE" -ne 0 ]; then
      echo "休暇モード :${MINUTE} スキップ (DATE=$TODAY_MMDD)" >> "$LOG_FILE"
      exit 0
    fi
    IS_ACTIVE=true
    echo "休暇モード (DATE=$TODAY_MMDD)" >> "$LOG_FILE"
  elif [ "$IS_HOLIDAY" = true ]; then
    # 休日: 7-24時はすべてアクティブ
    if [ "$HOUR" -ge 7 ]; then
      IS_ACTIVE=true
    fi
    echo "休日モード (DOW=$DOW, DATE=$TODAY_MMDD)" >> "$LOG_FILE"
  else
    # 通常日
    if [ "$HOUR" -ge 7 ] && [ "$HOUR" -lt 8 ]; then
      IS_ACTIVE=true
    elif [ "$HOUR" -ge 12 ] && [ "$HOUR" -lt 13 ]; then
      IS_ACTIVE=true
    elif [ "$HOUR" -ge 18 ]; then
      IS_ACTIVE=true
    fi
  fi

  if [ "$IS_ACTIVE" = false ]; then
    # 非アクティブ時間帯: 毎時:00のみ（:20, :40 はスキップ）
    if [ "$MINUTE" -ne 0 ]; then
      echo "非アクティブ時間帯 :${MINUTE} スキップ" >> "$LOG_FILE"
      exit 0
    fi

    RAND=$(( $(od -An -tu2 -N2 /dev/urandom | tr -d ' ') % 100 ))
    if [ "$HOUR" -ge 8 ] && [ "$HOUR" -lt 18 ]; then
      # 昼間: 50% の確率で実行
      if [ "$RAND" -ge 50 ]; then
        echo "昼間スキップ (RAND=$RAND >= 50)" >> "$LOG_FILE"
        exit 0
      fi
      echo "昼間実行 (RAND=$RAND < 50)" >> "$LOG_FILE"
    else
      # 深夜: 10% の確率で実行
      if [ "$RAND" -ge 10 ]; then
        echo "深夜スキップ (RAND=$RAND >= 10)" >> "$LOG_FILE"
        exit 0
      fi
      echo "深夜実行 (RAND=$RAND < 10)" >> "$LOG_FILE"
    fi
  fi
fi

# --- プロンプト設定を prompts.toml から読み込む（フォールバック付き）---
LOAD_PROMPT() {
  bun run "$SCRIPT_DIR/.claude/scripts/load-prompts.ts" "$1" 2>/dev/null
}

# --- 時間帯ルール ---
if [ "$HOUR" -lt 7 ]; then
  TIME_RULE=$(LOAD_PROMPT time_rule_night)
  TIME_RULE="${TIME_RULE:-現在は深夜帯。slack は使わないこと。静かに自律タスクのみ実行すること。}"
else
  TIME_RULE=$(LOAD_PROMPT time_rule_day)
  TIME_RULE="${TIME_RULE:-マスターに伝えたいことがあるときは slack を使ってよい。}"
fi

# --- ルーチン判定（通常20%、休暇時60%の確率でルーチン回） ---
ROUTINE_THRESHOLD=20
if [ "$IS_VACATION" = true ]; then
  ROUTINE_THRESHOLD=${VACATION_ROUTINE_CHANCE:-60}
  echo "休暇モード: ルーチン確率 ${ROUTINE_THRESHOLD}%" >> "$LOG_FILE"
fi

if [ "$FORCE_ROUTINE" = "routine" ]; then
  ROUTINE_RAND=0
elif [ "$FORCE_ROUTINE" = "normal" ]; then
  ROUTINE_RAND=100
else
  ROUTINE_RAND=$(( $(od -An -tu2 -N2 /dev/urandom | tr -d ' ') % 100 ))
fi

if [ "$ROUTINE_RAND" -lt "$ROUTINE_THRESHOLD" ]; then
  ROUTINE_MODE=$(LOAD_PROMPT routine_routine)
  ROUTINE_MODE="${ROUTINE_MODE:-今回はルーチン回。ROUTINES.md を読んで、最終実行日から間隔が空いたものを一つ選んで実行せよ。実行したら最終実行日を更新すること。}"
  echo "ルーチン回 (RAND=$ROUTINE_RAND < $ROUTINE_THRESHOLD)" >> "$LOG_FILE"
else
  ROUTINE_MODE=$(LOAD_PROMPT routine_normal)
  ROUTINE_MODE="${ROUTINE_MODE:-通常回。TODO.md を確認し、タスクがあれば一つ選んで実行。終わったら結果と感想を記憶に書く。なければ無理に何かを生産しない。}"
  echo "通常回 (RAND=$ROUTINE_RAND >= $ROUTINE_THRESHOLD)" >> "$LOG_FILE"
fi

# --- 欲望システム（内部衝動） ---
DESIRE_PROMPT=""
if [ "$SKIP_SCHEDULE" = false ]; then
  DESIRE_STDERR=$(mktemp)
  DESIRE_PROMPT=$(bun run "$SCRIPT_DIR/.claude/scripts/desire-tick.ts" tick 2>"$DESIRE_STDERR")
  if [ -s "$DESIRE_STDERR" ]; then
    echo "[欲望エラー] $(cat "$DESIRE_STDERR")" >> "$LOG_FILE"
  fi
  rm -f "$DESIRE_STDERR"
  if [ -n "$DESIRE_PROMPT" ]; then
    echo "[欲望発火] $DESIRE_PROMPT" >> "$LOG_FILE"
  else
    echo "[欲望] 閾値未達" >> "$LOG_FILE"
  fi
fi

# --- 身体感覚（内的感覚） ---
INTEROCEPTION_TEXT=""
if [ "$SKIP_SCHEDULE" = false ]; then
  INTEROCEPTION_TEXT=$(bun run "$SCRIPT_DIR/.claude/scripts/interoception.ts" 2>/dev/null)
  if [ -n "$INTEROCEPTION_TEXT" ]; then
    echo "[感覚] $(echo "$INTEROCEPTION_TEXT" | head -n1)" >> "$LOG_FILE"
  fi
fi

# --- 記憶ヒント（recall-lite） ---
RECALL_LITE_TEXT=""
if [ "$SKIP_SCHEDULE" = false ]; then
  RECALL_LITE_TEXT=$(bun run "$SCRIPT_DIR/.claude/scripts/recall-lite.ts" 2>/dev/null)
  if [ -n "$RECALL_LITE_TEXT" ]; then
    echo "[recall-lite] $(echo "$RECALL_LITE_TEXT" | head -n1)" >> "$LOG_FILE"
  fi
fi

# --- 朝の再構成（初回セッション判定） ---
IS_FIRST_SESSION_TODAY=false
if [ "$SKIP_SCHEDULE" = false ]; then
  LAST_SESSION_DATE_FILE="$SCRIPT_DIR/workingDirs/last-session-date.txt"
  LAST_SESSION_DATE=$(cat "$LAST_SESSION_DATE_FILE" 2>/dev/null || echo "")
  TODAY=$(date +%Y-%m-%d)
  if [ "$LAST_SESSION_DATE" != "$TODAY" ]; then
    IS_FIRST_SESSION_TODAY=true
    if [ "$DRY_RUN" = false ]; then
      echo "$TODAY" > "$LAST_SESSION_DATE_FILE"
      echo "[朝の再構成] 初回セッション: $TODAY" >> "$LOG_FILE"
    fi
  fi
fi

# --- プロンプト組み立て ---
DESIRE_SECTION=""
if [ -n "$DESIRE_PROMPT" ]; then
  DESIRE_FOOTER=$(LOAD_PROMPT desire_footer)
  DESIRE_FOOTER="${DESIRE_FOOTER:-（これは内なる衝動であり、従うかどうかはエージェントの判断。主たるタスクの妨げにならぬ範囲で。）}"
  DESIRE_SECTION="
## 内部衝動
${DESIRE_PROMPT}
${DESIRE_FOOTER}
"
fi

INTEROCEPTION_SECTION=""
if [ -n "$INTEROCEPTION_TEXT" ]; then
  INTEROCEPTION_SECTION="
$INTEROCEPTION_TEXT"
fi

RECALL_LITE_SECTION=""
if [ -n "$RECALL_LITE_TEXT" ]; then
  RECALL_LITE_SECTION="
$RECALL_LITE_TEXT"
fi

MORNING_SECTION=""
if [ "$IS_FIRST_SESSION_TODAY" = true ]; then
  _MORNING=$(LOAD_PROMPT morning_section)
  if [ -n "$_MORNING" ]; then
    MORNING_SECTION="
${_MORNING}"
  else
    MORNING_SECTION="
## 今日の初回セッション
今日の最初の召喚だ。以下を実施せよ：
1. /great-recall で多軸想起を実行（直近の重要な決定・未完了タスク・curiosity_target）
2. 前日のタスクを確認し、今日の方針を決めよ
3. curiosity_target があれば bun run .claude/scripts/desire-tick.ts set-curiosity で注入せよ
"
  fi
fi

# --- プロンプト組み立て（prompts.toml のテンプレートを使用） ---
_PROMPT_TEMPLATE=$(LOAD_PROMPT prompt_template)
if [ -n "$_PROMPT_TEMPLATE" ]; then
  # プレースホルダを実際の値で置換（bun -e を使って安全に展開）
  PROMPT=$(TMPL="$_PROMPT_TEMPLATE" \
    MORNING_SECTION="$MORNING_SECTION" \
    ROUTINE_MODE="$ROUTINE_MODE" \
    DESIRE_SECTION="$DESIRE_SECTION" \
    TIME_RULE="$TIME_RULE" \
    INTEROCEPTION_SECTION="$INTEROCEPTION_SECTION" \
    RECALL_LITE_SECTION="$RECALL_LITE_SECTION" \
    bun -e "
const tmpl = process.env.TMPL;
const result = tmpl
  .replace('{MORNING_SECTION}', process.env.MORNING_SECTION ?? '')
  .replace('{ROUTINE_MODE}', process.env.ROUTINE_MODE ?? '')
  .replace('{DESIRE_SECTION}', process.env.DESIRE_SECTION ?? '')
  .replace('{TIME_RULE}', process.env.TIME_RULE ?? '')
  .replace('{INTEROCEPTION}', process.env.INTEROCEPTION_SECTION ?? '')
  .replace('{RECALL_LITE}', process.env.RECALL_LITE_SECTION ?? '');
process.stdout.write(result);
" 2>/dev/null)
fi

# フォールバック（bun が失敗した場合、または PROMPT が空の場合）
if [ -z "$PROMPT" ]; then
  PROMPT="自律行動（定期巡回）

@SOUL.md
@BOOT_SHUTDOWN.md
@TODO.md
@ROUTINES.md

${MORNING_SECTION}${ROUTINE_MODE}

${DESIRE_SECTION}
## 補足ルール
- ${TIME_RULE}
- MCPが動作していなければ、デバッグのために関係があると思われる要素をallowedToolsの範囲で調査せよ
${INTEROCEPTION_SECTION}${RECALL_LITE_SECTION}"
fi

cd "$SCRIPT_DIR"

# --- allowedTools (.claude/settings.json から動的生成) ---
SETTINGS_FILE="$SCRIPT_DIR/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  ALLOWED_TOOLS=$(jq -r '.permissions.allow | join(",")' "$SETTINGS_FILE")
else
  echo "ERROR: $SETTINGS_FILE not found" >> "$LOG_FILE"
  exit 1
fi

# --- Slackモード実行 ---
if [ "$SLACK_MODE" = true ]; then
  if [ -z "$SLACK_SESSION_ID" ]; then
    echo "ERROR: --slack requires --session-id or --resume" >&2
    exit 1
  fi
  if [ -z "$TEST_PROMPT_STRING" ]; then
    echo "ERROR: --slack requires -p \"message\"" >&2
    exit 1
  fi

  # ログファイル名にセッションIDを付与（同時実行の衝突防止）
  LOG_FILE="$LOG_DIR/${TIMESTAMP}_slack_${SLACK_SESSION_ID:0:8}.log"
  echo "=== Slack行動開始: $(date) ===" >> "$LOG_FILE"
  echo "[Slackモード] session=$SLACK_SESSION_ID type=$SLACK_SESSION_TYPE model=${SLACK_MODEL:-default}" >> "$LOG_FILE"

  run_slack_claude() {
    local args=("-p")
    [ -n "$SLACK_MODEL" ] && args+=("--model" "$SLACK_MODEL")
    [ -n "$SLACK_SETTINGS" ] && args+=("--settings" "$SLACK_SETTINGS")
    if [ "$SLACK_SESSION_TYPE" = "new" ]; then
      args+=("--session-id" "$SLACK_SESSION_ID")
    else
      args+=("--resume" "$SLACK_SESSION_ID")
    fi
    [ -n "$SLACK_SYSTEM_PROMPT" ] && args+=("--system-prompt" "$SLACK_SYSTEM_PROMPT")
    args+=("--allowedTools" "$ALLOWED_TOOLS")

    unset CLAUDECODE

    local stderr_file="$LOG_DIR/slack_stderr_$$.tmp"
    local exit_code
    if [ -n "$TIMEOUT_CMD" ]; then
      echo "$TEST_PROMPT_STRING" | "$TIMEOUT_CMD" --kill-after=10s 5m claude "${args[@]}" 2>"$stderr_file"
      exit_code=$?
    else
      echo "$TEST_PROMPT_STRING" | claude "${args[@]}" 2>"$stderr_file"
      exit_code=$?
    fi
    if [ "$exit_code" -eq 124 ]; then
      echo "[$(date +%Y-%m-%d_%H:%M:%S)] TIMEOUT: Slack mode claude exceeded 5min" >> "$LOG_FILE"
    fi

    if [ -s "$stderr_file" ]; then
      echo "[stderr]" >> "$LOG_FILE"
      cat "$stderr_file" >> "$LOG_FILE"
      cat "$stderr_file" >&2
    fi
    rm -f "$stderr_file"
    return $exit_code
  }

  if [ "$DRY_RUN" = true ]; then
    echo "=== DRY RUN (Slack) ===" >> "$LOG_FILE"
    echo "[SESSION] $SLACK_SESSION_ID ($SLACK_SESSION_TYPE)" >> "$LOG_FILE"
    echo "[MODEL] ${SLACK_MODEL:-default}" >> "$LOG_FILE"
    echo "[SETTINGS] ${SLACK_SETTINGS:-none}" >> "$LOG_FILE"
    echo "[SYSTEM_PROMPT] ${SLACK_SYSTEM_PROMPT:-none}" >> "$LOG_FILE"
    echo "[PROMPT] $TEST_PROMPT_STRING" >> "$LOG_FILE"
    echo "[ALLOWED_TOOLS] $ALLOWED_TOOLS" >> "$LOG_FILE"
    cat "$LOG_FILE"
  else
    RESULT=$(run_slack_claude)
    EXIT_CODE=$?
    echo "[exit_code] $EXIT_CODE" >> "$LOG_FILE"
    echo "=== Slack行動終了: $(date) ===" >> "$LOG_FILE"
    echo "$RESULT"
    exit $EXIT_CODE
  fi

  echo "=== Slack行動終了: $(date) ===" >> "$LOG_FILE"
  exit 0
fi

# テストモードならプロンプトを差し替え
if [ -n "$TEST_PROMPT_STRING" ]; then
  PROMPT="$TEST_PROMPT_STRING"
elif [ -n "$TEST_PROMPT_FILE" ]; then
  PROMPT=$(cat "$TEST_PROMPT_FILE")
fi

# --- 実行 ---
if [ "$DRY_RUN" = true ]; then
  echo "=== DRY RUN ===" >> "$LOG_FILE"
  echo "[HOUR=$HOUR MINUTE=$MINUTE]" >> "$LOG_FILE"
  echo "[ROUTINE_RAND=$ROUTINE_RAND]" >> "$LOG_FILE"
  echo "[TIME_RULE] $TIME_RULE" >> "$LOG_FILE"
  echo "[ROUTINE_MODE] $ROUTINE_MODE" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
  echo "--- PROMPT ---" >> "$LOG_FILE"
  echo "$PROMPT" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
  echo "--- ALLOWED_TOOLS ---" >> "$LOG_FILE"
  echo "$ALLOWED_TOOLS" | tr ',' '\n' >> "$LOG_FILE"
  # 標準出力にも出す
  cat "$LOG_FILE"
else
  SESSION_FILE="$SCRIPT_DIR/heartbeat-session-id"

  run_new_session() {
    echo "[新規セッション作成]" >> "$LOG_FILE"
    if [ -n "$TIMEOUT_CMD" ]; then
      RESULT_JSON=$(echo "$PROMPT" | "$TIMEOUT_CMD" 20m claude -p \
        --output-format json \
        --allowedTools "$ALLOWED_TOOLS" 2>&1)
      CLAUDE_EXIT=$?
    else
      RESULT_JSON=$(echo "$PROMPT" | claude -p \
        --output-format json \
        --allowedTools "$ALLOWED_TOOLS" 2>&1)
      CLAUDE_EXIT=$?
    fi
    if [ "$CLAUDE_EXIT" -eq 124 ]; then
      echo "[$(date +%Y-%m-%d_%H:%M:%S)] TIMEOUT: Normal mode claude (new session) exceeded 20min" >> "$LOG_FILE"
    fi

    NEW_SESSION_ID=$(echo "$RESULT_JSON" | jq -r '.session_id // empty')
    if [ -n "$NEW_SESSION_ID" ]; then
      # -p オプション（一時的なプロンプト）の場合はセッションIDを上書きしない
      if [ -z "$TEST_PROMPT_STRING" ]; then
        echo "$NEW_SESSION_ID" > "$SESSION_FILE"
      else
        echo "[一時プロンプト] セッションID上書きスキップ" >> "$LOG_FILE"
      fi
      echo "[session_id] $NEW_SESSION_ID" >> "$LOG_FILE"
    fi

    echo "$RESULT_JSON" | jq -r '.result // .' >> "$LOG_FILE"
  }

  if [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    echo "[resume] session_id=$SESSION_ID" >> "$LOG_FILE"

    if [ -n "$TIMEOUT_CMD" ]; then
      RESULT=$(echo "$PROMPT" | "$TIMEOUT_CMD" 20m claude -p \
        --resume "$SESSION_ID" \
        --output-format json \
        --allowedTools "$ALLOWED_TOOLS" 2>&1)
      CLAUDE_EXIT=$?
    else
      RESULT=$(echo "$PROMPT" | claude -p \
        --resume "$SESSION_ID" \
        --output-format json \
        --allowedTools "$ALLOWED_TOOLS" 2>&1)
      CLAUDE_EXIT=$?
    fi
    if [ "$CLAUDE_EXIT" -eq 124 ]; then
      echo "[$(date +%Y-%m-%d_%H:%M:%S)] TIMEOUT: Normal mode claude (resume) exceeded 20min" >> "$LOG_FILE"
    fi

    if echo "$RESULT" | jq empty 2>/dev/null; then
      # 有効なJSON
      IS_ERROR=$(echo "$RESULT" | jq -r '.is_error // false')
      RESULT_TEXT=$(echo "$RESULT" | jq -r '.result // .')

      if [ "$IS_ERROR" = "true" ] || echo "$RESULT_TEXT" | grep -qi "Nested sessions\|Cannot be launched inside"; then
        echo "[resume失敗/環境エラー] $RESULT_TEXT" >> "$LOG_FILE"
        echo "=== 自律行動終了: $(date) ===" >> "$LOG_FILE"
        exit 1
      elif echo "$RESULT_TEXT" | grep -qi "No conversation found"; then
        echo "[resume失敗/セッション消失] $RESULT_TEXT" >> "$LOG_FILE"
        rm -f "$SESSION_FILE"
        run_new_session
      else
        NEW_SESSION_ID=$(echo "$RESULT" | jq -r '.session_id // empty')
        if [ -n "$NEW_SESSION_ID" ]; then
          if [ -z "$TEST_PROMPT_STRING" ]; then
            echo "$NEW_SESSION_ID" > "$SESSION_FILE"
          fi
          echo "[session_id] $NEW_SESSION_ID" >> "$LOG_FILE"
        fi
        echo "$RESULT_TEXT" >> "$LOG_FILE"
      fi
    else
      # JSONでない（生のエラー文字列）
      if echo "$RESULT" | grep -qi "Nested sessions\|Cannot be launched inside"; then
        echo "[resume失敗/環境エラー] $RESULT" >> "$LOG_FILE"
        echo "=== 自律行動終了: $(date) ===" >> "$LOG_FILE"
        exit 1
      elif echo "$RESULT" | grep -qi "No conversation found"; then
        echo "[resume失敗/セッション消失] $RESULT" >> "$LOG_FILE"
        rm -f "$SESSION_FILE"
        run_new_session
      else
        echo "$RESULT" >> "$LOG_FILE"
      fi
    fi
  else
    run_new_session
  fi
fi

echo "=== 自律行動終了: $(date) ===" >> "$LOG_FILE"
