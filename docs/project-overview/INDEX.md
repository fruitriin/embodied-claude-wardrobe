# エコシステム概要 — インデックス

> 生成日: 2026-03-29 | コミット: dbb41e52 chore: 組み込みauto-memoryを無効化

embodied-claude-wardrobe をベースとしたエージェントのハーネス。
memory-mcp を内蔵し、身体性と自律行動を備えた embodied AI の基盤。
SOUL.md にエージェント固有の人格が定義される。

概念システム別に分類したドキュメント群。実装種別（スキル/フック/MCP/スクリプト）では分けていない。

## 概念システム一覧

| ファイル | システム | 主な構成要素 |
|---|---|---|
| [system-memory.md](system-memory.md) | 記憶 (Memory) | memory-mcp, recall, remember, great-recall, rebuild-index, FLASH.md, recall-hook, recall-watcher |
| [system-embodied.md](system-embodied.md) | 身体性 (Embodiment) | heartbeat-daemon, interoception, desire-tick, statusline, system-health |
| [system-senses.md](system-senses.md) | 知覚 (Senses) | observe, look, annotate-grid, clip-image, say, hearing-* |
| [system-reading.md](system-reading.md) | 読書 (Reading) | read, slide-watch, reader.ts |
| [system-autonomous.md](system-autonomous.md) | 自律行動 (Autonomous) | autonomous-action.sh, continue-check, schedule.conf, ROUTINES.md, sleep/awake |
| [system-soul.md](system-soul.md) | 魂・メタ (Soul & Meta) | SOUL.md, CLAUDE.md, state.md, wardrobe-setup, wardrobe-configure, wardrobe-migrate, project-claude-overview |

## 補完ドキュメント

| ファイル | 内容 |
|---|---|
| [claude-md-deps.md](claude-md-deps.md) | CLAUDE.md 依存グラフ・Boot Sequence |
| [phase-flows.md](phase-flows.md) | フェーズ進行スキル一覧（自動検出） |
| [interactions.md](interactions.md) | システム間相互作用アスキーアート |

## 全要素カウント

- スキル: 15本（うち .exp.md あり: 6本）
- オプショナルスキル（wardrobeOptions）: 2本
- フックスクリプト: 10本（.claude/hooks/）
- スクリプト: 8本（.claude/scripts/ — .ts 7本 + .sh 1本）
- ネイティブツール: 2本（.claude/tools/ — Swift バイナリ）
- 概念システム: 6（前回5 → 今回6。「知覚」を新設）
