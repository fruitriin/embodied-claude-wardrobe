# エコシステム概要 — インデックス

> 生成日: 2026-03-30 | コミット: 60bf8bc8 WIP: fix: ログディレクトリ統一、prompts.toml トーン修正、say.sh 二重配置解消

embodied-claude-wardrobe をベースとしたエージェントのハーネス。
memory-mcp を内蔵し、身体性と自律行動を備えた embodied AI の基盤。
SOUL.md にエージェント固有の人格が定義される。

概念システム別に分類したドキュメント群。実装種別（スキル/フック/MCP/スクリプト）では分けていない。

## 概念システム一覧

| ファイル | システム | 主な構成要素 |
|---|---|---|
| [system-memory.md](system-memory.md) | 記憶 | memory-mcp, wd-recall, wd-remember, wd-great-recall, FLASH.md |
| [system-embodied.md](system-embodied.md) | 身体性 | interoception, heartbeat-daemon, desire-tick, statusline |
| [system-autonomous.md](system-autonomous.md) | 自律行動 | autonomous-action.sh, schedule.conf, ROUTINES.md, continue-check |
| [system-perception.md](system-perception.md) | 知覚 | wd-observe, wd-look, wd-say, wifi-cam, hearing |
| [system-reading-knowledge.md](system-reading-knowledge.md) | 読書・知識 | wd-read, wd-slide-watch, wd-knowhow, wd-cc-tracker |
| [system-soul-harness.md](system-soul-harness.md) | 魂・ハーネス | SOUL.md, wd-setup, wd-configure, wd-migrate, レビューエージェント群 |

## 補完ドキュメント

| ファイル | 内容 |
|---|---|
| [claude-md-deps.md](claude-md-deps.md) | CLAUDE.md 依存グラフ・Boot Sequence |
| [phase-flows.md](phase-flows.md) | フェーズ進行スキル一覧（自動検出） |
| [interactions.md](interactions.md) | システム間相互作用アスキーアート |

## 全要素カウント

- スキル: 21本（うち .exp.md あり: 1本）
- オプショナルスキル（wardrobeOptions）: 2本（sleep, awake）
- エージェント（.claude/agents/）: 4本
- フックスクリプト: 13本（.claude/hooks/）
- スクリプト: 8本（.claude/scripts/）
- 概念システム: 6（前回: 6 — 分類は同一、構成要素に差分あり）
