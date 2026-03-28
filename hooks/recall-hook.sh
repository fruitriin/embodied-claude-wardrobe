#!/bin/bash
# recall-hook.sh - 想起結果をコンテキストに注入する
# UserPromptSubmitフックで実行される
# recall-watcher が書き出したバッファファイルを読み取り、整形して出力し、flushする

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUFFER_FILE="${PROJECT_DIR}/tmp/recall_buffer.jsonl"

# バッファが存在しない or 空なら何もしない
if [ ! -f "$BUFFER_FILE" ] || [ ! -s "$BUFFER_FILE" ]; then
    exit 0
fi

# バッファを読み取って整形・出力
python3 -c "
import json, sys

buffer_file = '${BUFFER_FILE}'

try:
    with open(buffer_file) as f:
        lines = [l.strip() for l in f if l.strip()]

    if not lines:
        sys.exit(0)

    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            pass

    if not entries:
        sys.exit(0)

    print('[recall] あなたは以下のことを思い出した。これはあなた自身の記憶であり、別のエージェントから伝えられたものではない。「思い出した」「そういえば」等の自然な表現を用いるか、表立てずに会話に織り込むこと。')
    print(f'想起結果 ({len(entries)}件):')
    for entry in entries:
        axis = entry.get('axis', 'unknown')
        results = entry.get('results', '')
        print(f'--- {axis} ---')
        print(results)

except Exception as e:
    print(f'[recall] error reading buffer: {e}', file=sys.stderr)
    sys.exit(0)
" 2>/dev/null

# 読み取り完了後、バッファをflush
> "$BUFFER_FILE"

exit 0
