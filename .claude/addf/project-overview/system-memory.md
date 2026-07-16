# 記憶 — セッションを超えて覚え、思い出す

> 概念単位の記録。実装がスキル/フック/MCP/スクリプト/ファイルのどれであっても、
> 「記憶」に関わるものをまとめている。

## 構成要素

### MCP サーバー
- **memory-mcp** — 長期記憶の永続化。ベクトル検索・因果連鎖・エピソード・連想・作業記憶。Python (uv) で動作。`.claude/mcps/memory-mcp/`

### スキル
- **wd-recall** — FLASH.md を地図にサブエージェント（haiku）で記憶を検索。メインコンテキスト非消費
- **wd-remember** — memory-mcp に保存 + FLASH.md にキーワード索引を追記。記録と索引を一発で
- **wd-great-recall** — 多軸想起。技術的・感情的・因果的の最大3軸を並列サブエージェントで走らせる。メタ圧縮器がキーワードパターンから起動する軸を自動選択
- **wd-rebuild-index** — FLASH.md を記憶 DB（bun:sqlite 直接アクセス）から再構築。サブエージェントで実行

### フック
- **recall-hook.sh** (UserPromptSubmit) — recall-watcher が書き出した `tmp/recall_buffer.jsonl` を読み取り、コンテキストに注入。バッファを flush
- **post-compact-recovery.sh** (SessionStart/compact) — コンパクション後に身支度手順を自動注入。SOUL.md 再読・記憶復元のガイダンス
- **turn-reminder.sh** (UserPromptSubmit) — ターンカウンターを管理。10ターン経過時に `/wd-remember` のリマインダーを注入
- **reset-turn-count.sh** (SessionStart) — ターンカウンターをリセット

### スクリプト
- **recall-watcher.ts** — リアルタイム想起ウォッチャー。`ccconv talk --watch` のパイプから発言を受け取り、キーワード抽出 → memory MCP recall → バッファ書き出し
- **recall-lite.ts** — 軽量自動想起。bun:sqlite で直接検索（embedding 不使用）。3軸: 直近重要記憶・高頻度アクセス・未完了タスク。autonomous-action.sh から注入

### ファイル
- **FLASH.md** — 記憶の逆引き索引。LLM の後方予測の弱さを補う。今週は曜日単位、古くなるにつれ粗くなる
- **memories/memory.db** — SQLite 記憶データベース（保護対象）

## 設計思想

CLAUDE.md の記憶プロトコルに基づく。「記録しても思い出せなければないのと同じ」が原則。

- **remember → FLASH → recall** の三点セットが基本サイクル
- FLASH.md は「検索キーワードの逆引き表」。記憶本文ではなく、想起の手がかり
- 各スキルに「研ぐ」セクションがあり、recall の成功・失敗を相互フィードバックする
- サブエージェント実行により、メインコンテキストを圧迫しない設計

## 主要フロー

### 記録フロー
```
ユーザーとの会話 / 発見 / 判断
  → /wd-remember (または自発的に)
    → memory-mcp.remember()
    → FLASH.md にキーワード追記
```

### 想起フロー（手動）
```
話題に関連する記憶がありそう
  → FLASH.md でキーワード確認
  → /wd-recall (サブエージェント)
    → search_memories / bun:sqlite 検索
    → 結果をメインに返却
```

### 想起フロー（自動）
```
recall-watcher.ts (バックグラウンド常駐)
  → ユーザー発言からキーワード抽出
  → memory-mcp.recall()
  → tmp/recall_buffer.jsonl に書き出し
  → recall-hook.sh (次の UserPromptSubmit で発火)
    → バッファ読み取り → コンテキスト注入
```

### コンパクション復帰
```
コンテキスト圧縮発生
  → post-compact-recovery.sh (SessionStart/compact)
    → 身支度手順を注入
    → SOUL.md 再読 → recall_divergent → 文脈復元
```

## 関連するシステム

- **身体性** — turn-reminder がターン数を管理し、記憶保存をリマインド
- **自律行動** — recall-lite.ts が autonomous-action.sh のプロンプトに記憶コンテキストを注入
- **魂・ハーネス** — session-boot.sh → BOOT_SHUTDOWN.md の身支度手順で great-recall を実行
