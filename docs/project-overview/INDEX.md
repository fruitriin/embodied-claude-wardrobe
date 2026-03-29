# エコシステム概要 — インデックス

> 生成日: 2026-03-29 | コミット: 446becd8 WIP: chore: .claude/memories/.keep を追加（memory-mcp の DB ディレクトリを確保）

embodied-claude-wardrobe をベースとしたエージェントのハーネス。
memory-mcp を内蔵し、身体性と自律行動を備えた embodied AI の基盤。
SOUL.md にエージェント固有の人格が定義される。

概念システム別に分類したドキュメント群。実装種別（スキル/フック/MCP/スクリプト）では分けていない。

## 概念システム一覧

| ファイル | システム | 主な構成要素 |
|---|---|---|
| [system-memory.md](system-memory.md) | 記憶 (memory) | memory-mcp, wd-recall, wd-remember, wd-great-recall, wd-rebuild-index, FLASH.md, recall-hook.sh, recall-watcher.ts, recall-lite.ts, post-compact-recovery.sh |
| [system-embodied.md](system-embodied.md) | 身体性 (embodied) | interoception.sh, interoception.ts, heartbeat-daemon.sh, launchd plist, desire-tick.ts, desires.conf, system-health.ts, statusline.ts |
| [system-perception.md](system-perception.md) | 知覚 (perception) | wifi-cam MCP, hearing MCP, wd-observe, wd-look, wd-annotate-grid, wd-clip-image, wd-say, hearing-hook.sh, hearing-stop-hook.sh |
| [system-reading-knowledge.md](system-reading-knowledge.md) | 読書・知識 (reading-knowledge) | wd-read, wd-slide-watch, wd-knowhow, wd-knowhow-index, wd-knowhow-filter, reader.ts, sanitize |
| [system-autonomous.md](system-autonomous.md) | 自律行動 (autonomous) | autonomous-action.sh, ROUTINES.md, schedule.conf, prompts.toml, load-prompts.ts, continue-check.sh, sleep, awake |
| [system-soul-harness.md](system-soul-harness.md) | 魂・ハーネス (soul-harness) | SOUL.md, CLAUDE.md, BOOT_SHUTDOWN.md, state.md, wd-setup, wd-configure, wd-migrate, wd-project-claude-overview, settings.json |

## 補完ドキュメント

| ファイル | 内容 |
|---|---|
| [claude-md-deps.md](claude-md-deps.md) | CLAUDE.md 依存グラフ・Boot Sequence |
| [phase-flows.md](phase-flows.md) | フェーズ進行スキル一覧（自動検出） |
| [interactions.md](interactions.md) | システム間相互作用アスキーアート |

## 全要素カウント

- スキル: 18本（うち .exp.md あり: 9本）
- オプショナルスキル（wardrobeOptions）: 2本
- フックスクリプト: 10本（.claude/hooks/）
- スクリプト: 7本（.claude/scripts/）
- 概念システム: 6（前回: 5 → 知覚を新設、読書と知識を統合）
