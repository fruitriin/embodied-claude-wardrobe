# Feature Flags & Codenames（フィーチャーフラグとコードネーム）

ソースマップ解析による未公開機能レポート（2026-03-31）

## ビルド時フラグシステム

`import { feature } from 'bun:bundle'` によるビルド時評価。
`feature('FLAG')` が false → コードブロックがバンドルから物理的に除去（DCE）。

## フラグ一覧（カテゴリ別）

### コード残存・外部ビルドに含まれるもの

**コア機能**
| フラグ | 内容 |
|---|---|
| `BUDDY` | コンパニオンスプライト（ペットガチャ）|
| `VOICE_MODE` | 音声入力 |
| `BRIDGE_MODE` | claude.ai WebSocket ブリッジ |
| `CCR_REMOTE_SETUP` | リモートセットアップ |
| `CCR_AUTO_CONNECT` | ブリッジ自動接続 |
| `CCR_MIRROR` | ブリッジミラーモード |
| `TERMINAL_PANEL` | ターミナルパネル UI（meta+j） |
| `WEB_BROWSER_TOOL` | ウェブブラウザツール |
| `AUTO_THEME` | 自動テーマ切替 |

**エージェント・ツール**
| フラグ | 内容 |
|---|---|
| `COORDINATOR_MODE` | コーディネーターモード |
| `FORK_SUBAGENT` | サブエージェントフォーク |
| `VERIFICATION_AGENT` | 敵対的検証エージェント |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | 組み込みエクスプローラー・プランエージェント |
| `AGENT_TRIGGERS` | スケジュール cron ツール |
| `AGENT_TRIGGERS_REMOTE` | リモートトリガー |
| `UDS_INBOX` | Unix Domain Socket エージェント間通信 |
| `AGENT_MEMORY_SNAPSHOT` | エージェント記憶スナップショット |

**分類器**
| フラグ | 内容 |
|---|---|
| `TRANSCRIPT_CLASSIFIER` | auto mode の AI 分類器 |
| `BASH_CLASSIFIER` | Bash コマンド危険度分類 |
| `TREE_SITTER_BASH_SHADOW` | tree-sitter Bash パーサー（シャドウ実行） |

**メモリ**
| フラグ | 内容 |
|---|---|
| `TEAMMEM` | チームメモリ同期 |
| `EXTRACT_MEMORIES` | 自動記憶抽出 |
| `MEMORY_SHAPE_TELEMETRY` | メモリ形状テレメトリ |
| `EXPERIMENTAL_SKILL_SEARCH` | スキル検索 |

**コンテキスト管理**
| フラグ | 内容 |
|---|---|
| `CONTEXT_COLLAPSE` | コンテキスト折りたたみ |
| `REACTIVE_COMPACT` | リアクティブコンパクト |
| `HISTORY_SNIP` | 履歴スニップ |
| `CACHED_MICROCOMPACT` | キャッシュ付きマイクロコンパクト |
| `TOKEN_BUDGET` | トークンバジェットトラッカー |
| `PROMPT_CACHE_BREAK_DETECTION` | キャッシュ破損検出 |

**その他**
| フラグ | 内容 |
|---|---|
| `CHICAGO_MCP` | Computer Use MCP 統合 |
| `MCP_SKILLS` | MCP リソースのスキル化 |
| `MCP_RICH_OUTPUT` | MCP リッチ出力 |
| `WORKFLOW_SCRIPTS` | ワークフロースクリプト |
| `ULTRAPLAN` | マルチエージェント探索 |
| `AWAY_SUMMARY` | 離席復帰サマリー |
| `NATIVE_CLIENT_ATTESTATION` | ネイティブクライアント認証 |

### DCE で除去されているもの（フラグ名のみ残存）

| フラグ | 推定内容 |
|---|---|
| `PROACTIVE` | 自律プロアクティブモード |
| `KAIROS` | 社内自律アシスタントモード |
| `KAIROS_BRIEF` / `KAIROS_CHANNELS` / `KAIROS_PUSH_NOTIFICATION` / `KAIROS_GITHUB_WEBHOOKS` / `KAIROS_DREAM` | KAIROS のサブ機能群 |

## GrowthBook コードネーム辞典

プロジェクトコードネーム: **tengu（天狗）**

### 主要フラグ

| フラグ名 | 内容 |
|---|---|
| `tengu_auto_mode_config` | auto mode の enabled/disabled/opt-in 制御 |
| `tengu_passport_quail` | extractMemories 有効化ゲート |
| `tengu_onyx_plover` | autoDream 設定（enabled, minHours, minSessions） |
| `tengu_bramble_lintel` | extractMemories 実行頻度（N ターンに1回） |
| `tengu_sage_compass` | advisor 機能の有効化 |
| `tengu_ultraplan_model` | ultraplan が使うモデル |
| `tengu_hive_evidence` | 検証エージェント（verification agent）有効化 |
| `tengu_moth_copse` | extractMemories のインデックス更新スキップ |
| `tengu_scratch` | スクラッチパッドの有効化 |
| `tengu_frond_boric` | アナリティクスシンクのキルスイッチ |
| `tengu_harbor` | チャンネル通知のランタイムゲート |
| `tengu_disable_bypass_permissions_mode` | bypass permissions の無効化 |

### 内部フラグ上書き

`CLAUDE_INTERNAL_FC_OVERRIDES` 環境変数で全フラグを上書き可能（ant ビルドのみ）。

## プロジェクトコードネーム一覧

| コードネーム | 正体 |
|---|---|
| **tengu（天狗）** | Claude Code 全体 |
| **KAIROS（カイロス）** | 社内自律アシスタントモード |
| **CHICAGO** | Computer Use MCP 統合 |
| **BUDDY** | ペットガチャ |
| **TORCH** | 不明（内部コマンド） |
| **capybara** | モデルコードネーム（thinking 保護ブロックのコメント） |

## スタブコマンド一覧

`isEnabled: () => false, isHidden: true, name: 'stub'` のもの:

bughunter, autofix-pr, teleport, good-claude, ctx_viz,
share, debug-tool-call, summary, perf-issue, onboarding,
break-cache, oauth-refresh, issue, ant-trace, mock-limits,
backfill-sessions, reset-limits, env

## 出典

- `src/constants/prompts.ts` の feature() 呼び出し
- `src/services/analytics/growthbook.ts`
- `src/services/analytics/datadog.ts`
- 各 commands/ ディレクトリの index.js / index.ts
