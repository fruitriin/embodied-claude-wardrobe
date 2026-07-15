# Knowhow Index

> 自動生成。`/wd-knowhow-index reindex` で再生成できる。

| ファイル | 要約 | キーワード |
|---|---|---|
| wardrobe/session-end-hook-design.md | SessionEnd フックの設計知見 | SessionEnd, nohup, バックグラウンド |
| claude-code/hooks.md | フック25種の仕様・if条件・exit code・環境変数 | hooks, PreToolUse, PostToolUse, SessionStart, if条件, CLAUDE_PROJECT_DIR |
| claude-code/subagents.md | サブエージェント定義・memory・skills・mcpServers | subagent, Agent, memory, isolation, worktree |
| claude-code/skills.md | スキル仕様・frontmatter・context:fork・動的注入 | skills, SKILL.md, context:fork, $ARGUMENTS, paths |
| claude-code/mcp.md | MCP設定・環境変数展開・リモートサーバー・headersHelper | MCP, .mcp.json, http, sse, headersHelper |
| wardrobe/mcp-project-dir-resolution.md | MCP のプロジェクトルート解決 — ${PWD} 汚染の2段防御と lsof 診断手順 | MCP, .mcp.json, ${PWD}, CLAUDE_PROJECT_DIR, cwd, マーカー探索, lsof, memory.db, 誤配置 |
| wardrobe/mcp-dynamic-tool-registry.md | MCP ツールを config 駆動で増減する — カメラ台数・mcp-pet 接続などに追従 | MCP, ツール登録, config, FastMCP, add_tool, listChanged, 日本語description, ASCII, シグネチャ, mcp-pet |
| claude-code/agent-teams.md | エージェントチーム・共有タスク・メッセージング | agent-teams, TeamCreate, TeammateIdle, experimental |
| wardrobe/vocabulary-horizon.md | 語彙の地平線 — 内在思考・推論バジェット・外出力の3軸で認知特性を設計 | 語彙の地平線, SOUL.md, 認知アーキテクチャ, 内在思考語彙, 外出力語彙, 推論バジェット, 専門家型, パートナー型, 特化型 |
| wardrobe/speed-consciousness-framework.md | 速度×意識フレームワーク — 実装判断の共通基準（速度4分類×意識2分類×経路分離） | 速度, 意識, 経路分離, 高圧縮高速, 高圧縮中速, 無意識, 意識的, 一時留保, 共鳴と採点 |
| wardrobe/timestamp-policy.md | タイムスタンプ方針 — 演算系は UTC 統一、台帳系はローカル TZ 付き ISO の使い分け | タイムスタンプ, UTC, タイムゾーン, naive, aware, memory-mcp, journal, TypeError, decay |
| wardrobe/postgres-persona-schema-separation.md | マルチペルソナで Postgres を共有するときはスキーマ単位で分離する | Postgres, ペルソナ分離, スキーマ, CREATE SCHEMA, persona_id, PGroonga, pgvector, マルチエージェント, keyword-buffer |
| wardrobe/docker-verify-db-test-isolation.md | 検証用Dockerコンテナを使い回すテストのDB分離 — beforeAllでのTRUNCATE + 本番URL誤爆防止ガード | Docker, テスト分離, TRUNCATE, beforeAll, DATABASE_URL, 意味検索, 非決定性, memory-pg-daemon |
