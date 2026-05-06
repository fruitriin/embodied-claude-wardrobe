# Memory-MCP 圏 改善計画

> keyword-buffer、蒸留、consolidate、FLASH.md を Memory-MCP 圏として一括管理。
> 感情MCPとの連携ポイントも含む。

## keyword-buffer 配置 ✅（2026-05-07 完了）

**出自**: Rem (embodied-claude) フォーク
**速度**: 高圧縮高速 / **意識**: 無意識（UserPromptSubmit フック）

### 経路
```
ユーザー入力 → keyword-buffer.py（sudachipy形態素解析）→ $PROJECT_DIR/.claude/sensory_buffer.jsonl
                                                            ↓ 意識的
                                                        crystallize_buffer → 動詞チェーン
```

### 実装内容
- `.claude/hooks/keyword-buffer.py` 配置（Rem ベース + ワードローブ向け修正）
- `.claude/hooks/run-keyword-buffer.sh` 配置（memory-mcp venv パスをワードローブ構造に整合）
- `.claude/settings.json` の UserPromptSubmit に追加
- 依存: sudachipy（memory-mcp の `.venv` 経由で解決済み）
- `.gitignore` に `sensory_buffer.jsonl` 追加（ペルソナ環境固有）

### Rem からの差分
- **保存先**: Rem は `~/.claude/sensory_buffer.jsonl`（ユーザー全体共有）→ ワードローブは `$CLAUDE_PROJECT_DIR/.claude/sensory_buffer.jsonl`（プロジェクト/ペルソナごとに分離）
- **ノイズワード**: `wardrobe`、`ワードローブ` を追加
- **venv パス**: Rem は `$PROJECT_DIR/memory-mcp/.venv/...` → ワードローブは `$PROJECT_DIR/.claude/mcps/memory-mcp/.venv/...`

### 動作確認済み
形態素解析 → 名詞/動詞抽出 → ノイズ除去 → JSONL 書き込みの一連を smoke test で確認済み。

### 残タスク（別計画）
- `crystallize_buffer` ツールを MCP 経由で意識的に呼び出す流れの統合
- バッファ肥大時のローテーション or サイズ上限制御
- `backfill-keywords-batch.py` 系の取り込み判断（過去ログからのキーワード再生成、ワードローブで必要かは未判断）

## 感情タグ付与（感情MCP連携）

**速度**: 高圧縮高速 / **意識**: 無意識（/wd-remember サブエージェント内で自動）

### 経路
```
/wd-remember 呼び出し → サブエージェント内で substance_get → 内発的感情ラベル / 最寄り感情を tags に追加
```

- FLASH.md にも感情インデックスを追記: `[joy] キーワード群`

## 蒸留判定（記憶の卒業）

**速度**: 高圧縮中速 / **意識**: 意識的

### 判断基準（CLAUDE.md 4層キャッシュに既記載）
- 再発パターンであるか
- 行動の前提を変えた原則であるか

### 経路
```
memory-mcp の記憶 → 意識的に「これは SOUL.md に卒業すべきか」判断
                   → SOUL.md の Core Truths / Values に書き込み
                   → /wd-remember で「なぜ昇格させたか」を記録
```

## Rem ベース・キャッチアップ戦略（確定）

**方針**: Memory-MCP の改善は **Rem フォーク**をベースに、最新版をどんどんキャッチアップする。独自に作り込まず、上流の改善を取り込む。

- keyword-buffer も Rem 由来
- consolidate_memories の高速化（9分→14秒）も Rem 由来
- 今後の発散制御・記憶整理の改善は Rem の動向を追う

互換性の基準: **SQLite メモリフォーマット**のみ。これさえ保てば Rem の最新を取り込める。

## consolidate_memories の発散制御

**速度**: 低速 / **意識**: 無意識（定期実行）

### 課題
- 記憶が増えると処理時間が発散する
- Rem は 9分→14秒に高速化済み（N+1 DBクエリ問題の解消、detect_overlap の閾値調整）

### 方針
- **Rem フォークの最新版を取り込む**（独自実装しない）
- desires.conf の「記憶整理」欲求（24h）で定期実行
- 処理時間の上限を設ける（タイムアウト）

## FLASH.md 再構築の発散制御

**速度**: 低速 / **意識**: 意識的（/wd-rebuild-index）

### 課題
- 記憶が増えると再構築時間が発散する

### 方針（確定）
- **まず一旦良さそうなものを構築する**。発散の壁にぶつかってから差分再構築を検討
- 全件再構築でも、現時点の記憶量なら許容範囲のはず
- 差分再構築の検討は、実際に「重い」と感じてから
- 構築の手がかり: memory-mcp の list_recent_memories で日付昇順に走査 → キーワード抽出 → FLASH.md フォーマットに整形

## desires 連携

→ 感情MCP計画 `docs/plans/emotion-mcp-implementation.md` に移動。感情がdesiresの増加率を修正する連携は感情MCP側の責務。
