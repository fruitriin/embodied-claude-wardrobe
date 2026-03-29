# バックログ — 仕掛中・未着手タスク

> 2026-03-29 セッションで洗い出したもの

## 仕掛中

### wd- プレフィックスリネームの残作業
- [ ] docs/project-overview/ 全域のリネーム漏れ修正（15件）→ `/wd-project-claude-overview` 再実行で解決
- [ ] docs/test-scenarios.md 内の旧スキル名更新
- [ ] wd-recall.md, wd-rebuild-index.md の `.exp.md` パス修正（`wd-` なし → `wd-` あり）
- [ ] wd-recall.md, wd-look.md, wd-rebuild-index.md, wd-great-recall.md 内のプレフィックスなし参照修正
- [ ] prompts.toml 内の `/great-recall` → `/wd-great-recall`
- [ ] wd-contribution.md, wd-code-review.md 内の `wardrobe-migrate` → `wd-migrate`

### コードレビュー指摘の対応
- [ ] W5: hearing-stop-hook.sh の `truncate_buffer` アトミック化
- [ ] W6: store.py の `_dim_checked` を `connect()` で明示的に初期化
- [ ] S3: migrate_embeddings_sqlite.py に自動バックアップ追加
- [ ] S4: config.py の `cwd.name == "memory-mcp"` を CLAUDE.md マーカーに変更
- [ ] S5: .claudeignore にワードローブ固有パターン追加（*.db, hearing_buffer.jsonl 等）

### リンクチェック Broken の修正
- [ ] autonomous-action.sh 内の `@HOLY_GRAIL.md`, `@TODO.md` 参照（ファイル不在）
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

## 将来の検討事項

- knowhow システムとアップストリームの knowhow 共有（wardrobe/ 配下の同期）
- PreToolUse フックで /tmp 使用をブロック（SOUL.md Boundaries に対応）
- statusline.ts の settings.json 登録（Orphaned 状態の解消）
- continue-check.sh の settings.json 登録検討
- コンテキストウィンドウ残量を interoception に追加
