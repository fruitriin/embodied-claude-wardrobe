# 前回セッションからの差分まとめ

2026-07-06 夜、リン同席セッション。サイクル5の申し送り（昇格 GO 取り）を消化した。

## 完了

- **投機3本を main へ squash 昇格**（リン承認済み）: journal-deprecation (`47f5408`) → heartbeat-dedup (`514fab3`) → orphaned-cleanup (`59bdcef`)。昇格後検品: journal bun test 24 pass / heartbeat 8 pass。worktree 3本撤収、Worktrees.md 更新済み
- **CI の根本修繕**: ci.yml の working-directory が 3/30 の MCP 集約（.claude/mcps/）に未追従で全ジョブ即死していた（`5ed8e6e`）。PR #2/#3 の CI 失敗はコードでなくこれが原因（リンの読みが的中）
- **lint/mypy 借金返済**: CI 停止中に溜まった ruff 10件 + mypy 9件を解消（`d02507f`、挙動変更なし、pytest 183 pass）
- **${PWD} 汚染事件の修繕一式**: memory-mcp が misskey worktree の DB に記憶を書いていた。記憶5件救出、config.py に containment 検証 + マーカー探索（`4166d38`）、mcp.json.template から全撤去（`ed47a72`）、knowhow 化（`ec725fe`）
- **PR #2/#3 本文を計画書へのマークダウンリンクに更新**（バッククォート括りを解消）+ update-branch で修正済み CI を再走

## 気になった点（申し送り）

- **既存の品質ゲート借金3件**（昇格とは無関係、TODO.md「品質ゲートの借金」に記録済み）: template-sync 28 fail / hooks-wiring 2 fail / ローカル ProgressTemplate.md の裏付け6行
- **W1（--log-path 任意追記）は未着手のまま**。修正案あり、30分の小仕事（TODO.md に転記済み）
- 旧 memory-mcp プロセス2匹（PID 25863/95468）が misskey DB を掴んで残存。他セッション終了で自然消滅する見込み

## PR / Issue リンク

- PR #3 (postgres-memory Phase 0): Draft、Phase 1 はリン GO 待ち
- PR #2 (emotion-mcp Layer 1): Draft、Critical 4件の設計判断待ち
- Issue #18/#19 (ADDF): 対応済み
