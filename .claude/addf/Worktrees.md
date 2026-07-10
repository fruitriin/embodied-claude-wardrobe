# Worktrees（投機の進行状態）

| worktree パス | ブランチ | 対象概念（出典） | 状態 | 最終更新 |
|---|---|---|---|---|
| ../wardrobe-test-spec-emotion-mcp-layer1 | speculative/emotion-mcp-layer1 | 感情MCP Layer 1（emotion-mcp-implementation.md） | PR #2 起票（Draft）・Stage 2 レビュー観点4件を PR 本文に明記 | 2026-07-04 未明 |
| ../wardrobe-test-spec-runall-strict | speculative/runall-strict | run-all.sh の bun 不在時を TOTAL_FAIL 加算に（前サイクル Stage 2 newcomer Critical 指摘） | テスト通過（0bdb953, 4象限分岐 + 実測3ケース検証 + 冒頭コメント整合） | 2026-07-04 02:25 |

## 完遂・main 昇格済み

| ブランチ | main コミット | 昇格日 |
|---|---|---|
| speculative/memory-fixes | `f6020bf` (squash) | 2026-07-03 夜 |
| speculative/nonregression-skills | `68df56b` (squash) | 2026-07-03 夜 |
| speculative/journal-deprecation | `47f5408` (squash) | 2026-07-06 夜（リン承認） |
| speculative/heartbeat-dedup | `514fab3` (squash) | 2026-07-06 夜（リン承認） |
| speculative/orphaned-cleanup | `59bdcef` (squash) | 2026-07-06 夜（リン承認） |

> 昇格3本の worktree は撤収済み。ブランチ（local/origin の speculative/ 3本と integration/loop-2026-07-06）は履歴保全のため未削除——整理するならリンの号令で。
