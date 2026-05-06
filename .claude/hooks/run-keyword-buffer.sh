#!/bin/bash
# keyword-buffer hook wrapper (uses memory-mcp venv for sudachipy)
#
# Rem (embodied-claude) ベース。ワードローブ向けの差分:
# - memory-mcp の場所が $PROJECT_DIR/.claude/mcps/memory-mcp/.venv/ になる
export PYTHONUTF8=1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PROJECT_DIR}/.claude/mcps/memory-mcp/.venv/bin/python3"
[ -x "$PYTHON" ] || PYTHON=python3
"$PYTHON" "$SCRIPT_DIR/keyword-buffer.py" 2>/dev/null
exit 0
