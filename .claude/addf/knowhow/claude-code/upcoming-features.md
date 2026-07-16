# Upcoming Features（未発表・実験的機能）

ソースマップ解析による未公開機能レポート（2026-03-31）

## 確度高（コード実装あり、TODO コメントで公開予定が示唆）

### advisor（顧問モード）
- `/advisor <model>` でサブモデルを「顧問」として設定
- GrowthBook フラグ: `tengu_sage_compass`
- `src/utils/advisor.ts` に「TODO(hackyon): Migrate to the real anthropic SDK types when this feature ships publicly」
- SDK 型定義がまだ存在しない → 公開時に移行予定

### ultraplan
- 30分タイムアウトのマルチエージェント探索
- CCR（Cloud Code Runtime）上でリモート実行
- `/ultraplan` とプロンプトに書くと自動起動するキーワード検知付き
- GrowthBook フラグ: `tengu_ultraplan_model`（使用モデルの指定）
- UI: `UltraplanChoiceDialog`, `UltraplanLaunchDialog`

### ultrareview
- コードレビュー専用コマンド
- クォータ管理あり（`ultrareviewEnabled.ts`）

### Remote Agent Scheduling
- `src/skills/bundled/scheduleRemoteAgents.ts` に「TODO(public-ship): Before shipping publicly...」
- cron ベースのリモートエージェントスケジューラ

## 確度中（コード実装あり、公開時期不明）

### buddy（コンパニオンスプライト）
- 18種族のペットガチャ（duck, goose, cat, dragon, axolotl, capybara 等）
- レアリティ: common(60%) / uncommon(25%) / rare(10%) / epic(4%) / legendary(1%)
- shiny(1%), 帽子（crown, tophat, wizard, tinyduck 等）
- ステータス: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
- ASCIIアートの3フレームアイドルアニメーション + まばたき
- 吹き出し発言、`/buddy pet` でハート演出
- **ティーザー: 2026-04-01〜07、レインボー表示**
- 4月以降は永続的に利用可能
- 社内ビルドでは先行利用可能

### VOICE_MODE（音声入力）
- `src/voice/`, `src/commands/voice/`
- `voiceStreamSTT.ts` が存在（「Only reachable in ant builds」）
- Datadog イベント: `tengu_voice_recording_started`, `tengu_voice_toggled`

### chrome（Claude in Chrome）
- ブラウザ拡張との統合
- `src/utils/claudeInChrome/setup.ts`, `prompt.ts`

### WORKFLOW_SCRIPTS / WorkflowTool
- ワークフロースクリプトという新しいスキル形態
- `feature('WORKFLOW_SCRIPTS')` でゲート

### CHICAGO_MCP（Computer Use MCP 統合）
- Computer Use API と MCP サーバーの橋渡し
- `feature('CHICAGO_MCP')` でゲート

### awaySummary（離席復帰サマリー）
- 離席中に起きたことの「while you were away」要約を自動生成

### DiscoverSkillsTool（スキル自動サーフェシング）
- ターンごとに関連スキルを自動提示
- `feature('EXPERIMENTAL_SKILL_SEARCH')` でゲート
- リモートスキルインデックスとの連携

## 確度低（スタブのみ）

| コマンド | 推測 |
|---|---|
| `bughunter` | 自動バグ探索 |
| `autofix-pr` | PR 自動修正 |
| `teleport` | 別 CCR 環境にブランチごと転送 |
| `good-claude` | 褒める機能？ 不明 |
| `ctx_viz` | コンテキスト可視化 |
| `summary` | セッション要約 |
| `onboarding` | オンボーディング |

## 社内専用（外部リリース予定不明）

### KAIROS（カイロス）
- Anthropic 社員向け自律アシスタントモード
- `<tick>` タグで定期的に起こされる
- サブフラグ: BRIEF, CHANNELS, PUSH_NOTIFICATION, GITHUB_WEBHOOKS, DREAM
- DCE で外部ビルドからは完全除去

### PROACTIVE
- プロアクティブ提案モード
- KAIROS と組み合わせて使用
- DCE で外部ビルドからは完全除去

### moreright（権限フック）
- スタブのみ。「The real hook is internal only.」
- 何を守っているかすら不明

### TORCH
- 内部コマンド（`commands/torch.js`）
- 用途不明

## 出典

- 各 `src/commands/` ディレクトリ
- `src/constants/prompts.ts` の feature() 呼び出し
- TODO コメント内の公開予定言及
- `src/buddy/` 全体
- `src/utils/advisor.ts`
- `src/skills/bundled/scheduleRemoteAgents.ts`
