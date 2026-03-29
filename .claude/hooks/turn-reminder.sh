#!/bin/bash
# turn-reminder.sh
# UserPromptSubmit フックで発火。ターン数をカウントし、
# 一定ターン経過時に記憶保存のリマインダーをコンテキストに注入する。

COUNTER_FILE="$CLAUDE_PROJECT_DIR/.claude/.turn-count"

# カウンター読み込み・インクリメント
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

if [ "$COUNT" -eq 10 ]; then
  cat <<'EOF'
[turn-reminder] 10ターン経過。重要な知見や判断があれば /wd-remember で記憶に刻むこと。記録したら作業を続行せよ。
以下のファイルはセッション中いつでも、ユーザーの確認なしに上書き更新してよい:
- state.md — 現在状態のスナップショット。頻繁に更新されるべきもの
- TODO.md — エージェント自身のタスク管理
- FLASH.md — 記憶インデックス。/wd-remember のたびに追記される
EOF
elif [ "$COUNT" -eq 15 ]; then
  cat <<'EOF'
[turn-reminder] 15ターン経過。コンパクション前に記憶の記録を推奨する。成果・未了・因果を整理し、/wd-remember で記録したら作業を続行せよ。
以下のファイルはセッション中いつでも、ユーザーの確認なしに上書き更新してよい:
- state.md — 現在状態のスナップショット。頻繁に更新されるべきもの
- TODO.md — エージェント自身のタスク管理
- FLASH.md — 記憶インデックス。/wd-remember のたびに追記される
EOF
fi

exit 0
