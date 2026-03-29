#!/usr/bin/env bash
# say.sh — TTS CLI wrapper (fire-and-forget)
# Usage: say.sh "テキスト" [--speaker camera|local|both]
set -euo pipefail

# ${CLAUDE_SKILL_DIR} が設定されていればそこから wardrobe ルートを算出、
# なければスクリプト自身の場所から2段上（.claude/scripts/ -> .claude/ -> wardrobe/）を使う
if [ -n "${CLAUDE_SKILL_DIR:-}" ]; then
  WARDROBE_ROOT="$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  WARDROBE_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
fi

TTS_DIR="${WARDROBE_ROOT}/.claude/mcps/tts-mcp"
export MCP_BEHAVIOR_TOML="${WARDROBE_ROOT}/mcpBehavior.toml"

exec uv run --directory "$TTS_DIR" python -m tts_mcp.cli "$@"
