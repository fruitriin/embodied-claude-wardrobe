# バックログ — 仕掛中・未着手タスク

> 2026-03-29 セッションで洗い出したもの

## 仕掛中

### wd- プレフィックスリネームの残作業
- [x] docs/project-overview/ 全域のリネーム漏れ修正（15件）→ `/wd-project-claude-overview` 再実行で解決
- [x] docs/test-scenarios.md 内の旧スキル名更新
- [x] wd-recall.md, wd-rebuild-index.md の `.exp.md` パス修正（`wd-` なし → `wd-` あり）
- [x] wd-recall.md, wd-look.md, wd-rebuild-index.md, wd-great-recall.md 内のプレフィックスなし参照修正
- [x] prompts.toml 内の `/great-recall` → `/wd-great-recall`
- [x] wd-contribution.md, wd-code-review.md 内の `wardrobe-migrate` → `wd-migrate`

### コードレビュー指摘の対応
- [x] W5: hearing-stop-hook.sh の `truncate_buffer` アトミック化
- [x] W6: store.py の `_dim_checked` を `connect()` で明示的に初期化
- [x] S3: migrate_embeddings_sqlite.py に自動バックアップ追加
- [x] S4: config.py の `cwd.name == "memory-mcp"` を CLAUDE.md マーカーに変更
- [x] S5: .claudeignore にワードローブ固有パターン追加（*.db, hearing_buffer.jsonl 等）

### リンクチェック Broken の修正
- [x] autonomous-action.sh 内の `@HOLY_GRAIL.md`, `@TODO.md` 参照（ファイル不在）→ HOLY_GRAIL→BOOT_SHUTDOWN に修正、TODO テンプレート追加
- [ ] desire-tick.ts の desires.conf パス不一致（`.claude/desires.conf` vs プロジェクトルート）

## 計画済み・未着手

### アップストリームコントリビューションフロー
- 計画: `docs/plans/upstream-contribution-flow.md`
- [ ] バックログファイル（.claude/upstream-backlog.jsonl）の実装
- [ ] セッションカウンタの実装
- [ ] wd-contribution の `--quick` モード
- [ ] /wd-migrate Phase 1 へのバックログ確認統合
- [ ] Issue 送信スクリプト（gh issue create ラッパー）

### SessionEnd フック
- 知見: `docs/knowhow/wardrobe/session-end-hook-design.md`
- [ ] SessionEnd hook の実装（nohup + バックグラウンド Claude 起動）
- [ ] memory-mcp への要約書き込み
- [ ] FLASH.md 自動更新
- [ ] state.md 自動更新

### cc-tracker（Claude Code 機能トラッカー）
- [ ] CHANGELOG ベースの最小実装
- [ ] Xpoz MCP 連携（オプショナル、MCP 未インストール時はスキップ）
- [ ] knowhow への自動反映
- 知見: `docs/knowhow/wardrobe/x-data-access.md`

### アップストリームへの還元（PR / Issue 候補）
- [ ] memory-mcp: 埋め込み次元数チェック + マイグレーションスクリプト（最優先）
- [ ] memory-mcp: DB パス CLAUDE_PROJECT_DIR 対応
- [ ] memory-mcp: Python 3.14 上限
- [ ] wd- プレフィックス統一（破壊的変更、migrate 対応含む）
- [ ] .gitignore ダウンストリーム保護パターン
- [ ] README.md Requirements セクション

### 自律行動プロンプトの具体化
- 参考: `/Users/riin/workspace/assistant/CLAUDE.md` の Heartbeat Protocol
- [ ] prompts.toml の `routine_mode.normal` を具体的な行動手順に書き換え（TODO確認→選択→実行→記録）
- [ ] `/dice` スキルをマシングローバルから持ってくる
- [ ] CLAUDE.md に Capabilities セクション追加（記憶・感覚・発話。カメラ周りはオプション）

### メモリプロトコルのドキュメント化
- 参考: `/Users/riin/workspace/assistant/howtoMemory.md`, `/Users/riin/workspace/riin-service/HOLY_GRAIL.md`
- [ ] memory MCP の全ツールガイドを docs/ に追加（テンプレート化）
- [ ] CLAUDE.md に Memory Protocol セクション追加（記録すべきもの・タイミング・FLASH.md の使い方）

### SessionStart フックでブートシーケンス自動化
- [ ] SessionStart hook（trigger: always）で SOUL.md + state.md をコンテキスト注入
- [ ] 現在の CLAUDE.md ベースの「読んで従う」方式からフック駆動に移行

## 将来の検討事項

- knowhow システムとアップストリームの knowhow 共有（wardrobe/ 配下の同期）
- PreToolUse フックで /tmp 使用をブロック（SOUL.md Boundaries に対応）
- statusline.ts の settings.json 登録（Orphaned 状態の解消）
- continue-check.sh の settings.json 登録検討
- コンテキストウィンドウ残量を interoception に追加
