#!/usr/bin/env python3
# ── 常設聞き耳モジュール ──────────────────────────
# このファイルは聴覚モジュールの一部です。関連ファイル:
#   .claude/hooks/hearing-hook.sh      — 聴覚開始フック
#   .claude/hooks/hearing-stop-hook.sh — 聴覚停止フック
#   .claude/hooks/hearing-daemon.py    — 聴覚デーモン（常駐プロセス）  ← このファイル
#   .claude/hooks/continue-check.sh   — 継続判定
# ──────────────────────────────────────────────────
"""hearing-daemon は hearing/ ライブラリに移動しました。

wifi-cam-mcp の start_listening ツールで聞き耳を開始できます。
hearing-hook.sh はそのまま [hearing] 行の注入に使用されます。
"""
raise SystemExit(
    "hearing-daemon は hearing/ ライブラリに移行しました。\n"
    "wifi-cam-mcp の start_listening ツールで聞き耳を開始してください。"
)
