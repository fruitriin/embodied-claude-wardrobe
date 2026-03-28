# Repository Guidelines

## Overview

embodied-claude-wardrobe は、Claude に「身体性」を与える MCP サーバー群と自律行動システムのモノレポです。感覚（視覚・聴覚・音声）、記憶、移動、欲望システムなどを独立した Python パッケージとして提供します。

## Project Structure

各 MCP サーバーは独立した Python パッケージ（`pyproject.toml` を持つ）です。

### MCP サーバー
- `memory-mcp/` — 長期記憶サーバー（連想発散・予測符号化・統合機能付き）。`memory-mcp/tests/` にテストあり
- `hearing/` — 聴覚 MCP サーバー。`hearing/tests/` にテストあり
- `tts-mcp/` — テキスト読み上げ MCP サーバー。`tts-mcp/tests/` にテストあり
- `wifi-cam-mcp/` — Wi-Fi PTZ カメラ制御 + 音声キャプチャ
- `usb-webcam-mcp/` — USB ウェブカメラキャプチャ
- `ip-webcam-mcp/` — IP ウェブカメラ MCP
- `system-temperature-mcp/` — システム温度センサー（Python 3.12+ 必須）
- `mobility-mcp/` — ロボット掃除機 MCP。`mobility-mcp/tests/` にテストあり
- `toio-mcp/` — toio キューブ MCP。`toio-mcp/tests/` にテストあり
- `mcp-pet/` — ペットインタラクション MCP。`mcp-pet/tests/` にテストあり
- `morning-call-mcp/` — モーニングコール MCP
- `desire-system/` — 欲望システム（時間蓄積 + 閾値発火）。`desire-system/tests/` にテストあり

### その他のディレクトリ
- `installer/` — PyInstaller ベースの GUI インストーラー
- `hooks/` — Bash フック（`interoception.sh`, `recall-hook.sh`）
- `scripts/` — Bun (TypeScript) で実行するユーティリティスクリプト
- `templates/` — ユーザーカスタマイズ用の Markdown テンプレート
- `docs/` — ドキュメントとアーキテクチャ図
- `autonomous-action.sh` — cron で20分ごとに実行する自律行動スクリプト
- `mcpBehavior.toml` — MCP 動作設定

## Build, Test, and Development Commands

各サブプロジェクトのディレクトリ内でコマンドを実行してください。

```bash
# 依存関係のインストール
cd <subproject> && uv sync

# サーバーの起動
cd <subproject> && uv run <server-name>
# 例: cd memory-mcp && uv run memory-mcp

# テストの実行
cd <subproject> && uv run pytest
# 例: cd memory-mcp && uv run pytest
#     cd toio-mcp && uv run pytest

# Lint（設定済みのサブプロジェクトのみ）
cd <subproject> && uv run ruff check .

# TypeScript スクリプトの実行
bun run scripts/<script-name>.ts
```

## Coding Style & Naming Conventions

- **Python**: 3.10+ 基準（`system-temperature-mcp/` のみ 3.12+ 必須）
- **インデント**: 4スペース
- **命名**: `snake_case` モジュール、`test_*.py` テストファイル
- **Ruff**: 行長 100 文字
- **非同期**: `asyncio` スタイルを標準とする
- **TypeScript**: Bun ランタイムで実行。Node.js API ではなく Bun ネイティブ API を優先

## Testing Guidelines

- フレームワーク: `pytest` + `pytest-asyncio`
- テストは各サブプロジェクトの `tests/` ディレクトリに配置する
- テストがあるパッケージ: `memory-mcp`, `hearing`, `tts-mcp`, `mobility-mcp`, `toio-mcp`, `mcp-pet`, `desire-system`

## Configuration & Hardware Notes

- `.env` はコミットしない。認証情報は環境変数で渡す
- 長期記憶データは `~/.claude/memories/` 以下に保存される
- WSL2 環境では USB ウェブカメラに `usbipd` フォワーディングが必要
- WSL2 ではシステム温度取得が動作しない
- Tapo カメラはローカルカメラアカウント（TP-Link クラウドアカウントではない）と固定 IP を推奨

## Commit & Pull Request Guidelines

- **Conventional Commits** を使用: `feat:`, `fix:`, `feat!:`, `docs:`, `chore:` など
- PR にはサマリー、テスト証跡（コマンドと結果）、ハードウェア前提（USB ウェブカメラ、GPU 等）を含める

