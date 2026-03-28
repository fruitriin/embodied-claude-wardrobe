---
name: wardrobe-migrate
description: "アップストリーム（embodied-claude-wardrobe）の最新版をダウンストリーム環境に安全に取り込む。保護対象ファイルを除いた差分を確認・適用する。"
argument-hint: "[--dry-run] [--yes]"
user_invocable: true
---

# /wardrobe-migrate — アップストリーム更新の取り込み

アップストリーム（embodied-claude-wardrobe）の最新版をダウンストリーム（現在の環境）に安全にマイグレーションする。

**--dry-run**: 変更内容の確認のみ（実際には何も変更しない）
**--yes**: 確認プロンプトをスキップして自動適用

---

## Phase 1 — 状態確認

### 1-1. lock ファイル読み込み

`.claude/wardrobe-lock.json` を読む。存在しない場合は初回マイグレーションとして扱う。

```
現在バージョン: version
現在コミット: commit
最終更新: updated_at
リポジトリ: repository
```

### 1-2. git 作業ツリーの確認

```bash
git status --short
```

未コミットの変更がある場合は警告を表示し、続行するか確認する（--yes の場合は警告のみ）。

---

## Phase 2 — 最新版取得

アップストリームを一時ディレクトリにクローンする。

```bash
TMPDIR=$(mktemp -d)
git clone --depth=1 https://github.com/fruitriin/embodied-claude-wardrobe.git "$TMPDIR/wardrobe-upstream"
UPSTREAM_COMMIT=$(git -C "$TMPDIR/wardrobe-upstream" rev-parse HEAD)
echo "アップストリーム最新コミット: $UPSTREAM_COMMIT"
```

lock の commit と一致する場合:

```
すでに最新版です（$UPSTREAM_COMMIT）。マイグレーション不要。
```

で終了してよい。ただし --dry-run 時は差分算出まで進む。

---

## Phase 3 — 差分算出

### マイグレーション対象（アップストリーム管理）

以下のパスはアップストリームで管理され、更新時に上書き適用される:

| パス | 備考 |
|------|------|
| `.claude/commands/*.md` | `*.exp.md` を除く |
| `.claude/hooks/` | 全ファイル |
| `.claude/scripts/` | 全ファイル |
| `.claude/templates/` | 全ファイル |
| `.claude/tools/` | 全ファイル |
| `.claude/wardrobeOptions/` | 全ファイル |
| `CLAUDE.md` | マージ注意（後述） |
| `AGENTS.md` | 上書き |
| `autonomous-action.sh` | 上書き |
| `prompts.toml` | 上書き |
| `mcpBehavior.toml` | 上書き |
| `docs/` | 全ファイル |
| `memory-mcp/` | diff 表示して手動確認推奨 |
| `hearing/` | diff 表示して手動確認推奨 |
| `tts-mcp/` | diff 表示して手動確認推奨 |

### 保護対象（ダウンストリーム固有、マイグレーション対象外）

以下のパスはユーザーカスタマイズ済みとして保護される:

- `SOUL.md` — ユーザー定義の人格
- `BOOT_SHUTDOWN.md` — カスタマイズ済みブート手順
- `ROUTINES.md` — ユーザー定義のルーチン
- `FLASH.md`, `FLASH-*.md` — 記憶インデックス
- `STATE.md` — 現在状態
- `.claude/commands/*.exp.md` — ローカル経験ファイル
- `.claude/wardrobe-lock.json` — 自身（最後に更新）
- `memories/` — 記憶データ
- `desires.conf`, `schedule.conf` — ユーザー設定
- `.env`, `.mcp.json` — 認証情報

### 差分の分類

```bash
diff -rq --exclude="*.exp.md" \
  "$TMPDIR/wardrobe-upstream/.claude/commands/" \
  ".claude/commands/" 2>/dev/null
```

各対象パスについて以下を分類する:
- **NEW**: アップストリームにあってダウンストリームにないファイル
- **CHANGED**: 両方に存在するが内容が異なるファイル
- **REMOVED**: アップストリームにないがダウンストリームにあるファイル
- **UNCHANGED**: 内容が同一のファイル

---

## Phase 4 — 変更確認（プレビュー表示）

以下の形式でサマリーを表示する:

```
=== wardrobe-migrate プレビュー ===

アップストリーム: 8888c6c (2026-03-28)
ダウンストリーム: abc1234 (2026-03-01)

--- 通常ファイル ---
[NEW]     .claude/commands/new-skill.md
[CHANGED] .claude/commands/recall.md
[CHANGED] AGENTS.md
[REMOVED] .claude/commands/old-skill.md

--- MCP サーバー（要手動確認） ---
[CHANGED] memory-mcp/src/server.py

--- settings.json（マージ対象） ---
[CHANGED] .claude/settings.json

--- CLAUDE.md（マージ注意） ---
[CHANGED] CLAUDE.md

--- 保護済み（スキップ） ---
SOUL.md, ROUTINES.md, desires.conf ...

合計: 4 件の変更
```

--dry-run の場合はここで終了。

---

## Phase 5 — 適用

--yes でない場合:

```
上記の変更を適用しますか？ (y/N)
```

y の場合のみ続行。

### 5-1. 通常ファイルの適用

NEW / CHANGED ファイルを上書きコピーする:

```bash
cp -f "$TMPDIR/wardrobe-upstream/.claude/commands/FILENAME" ".claude/commands/FILENAME"
```

REMOVED ファイルは**削除しない**（ユーザーがローカルで追加した可能性があるため）。代わりに警告を表示する:

```
[警告] アップストリームから削除された: .claude/commands/old-skill.md
       ダウンストリームには残されています。不要なら手動で削除してください。
```

### 5-2. settings.json のマージ

アップストリームの settings.json を読み込み、既存の settings.json とマージする。

```
bun -e "
const upstream = JSON.parse(await Bun.file('$TMPDIR/wardrobe-upstream/.claude/settings.json').text());
const current = JSON.parse(await Bun.file('.claude/settings.json').text());
// キーごとにマージ: current の値を優先しつつ、新しいキーを追加
const merged = { ...upstream, ...current };
// permissions は配列なので concat して重複を除去
if (upstream.permissions && current.permissions) {
  merged.permissions = [...new Set([...upstream.permissions, ...current.permissions])];
}
await Bun.write('.claude/settings.json', JSON.stringify(merged, null, 2) + '\n');
console.log('settings.json マージ完了');
"
```

### 5-3. CLAUDE.md のマージ

CLAUDE.md はアップストリームとダウンストリームの両方が独立して変更しうる。

以下の方針でマージする:

1. アップストリームの CLAUDE.md を `.claude/wardrobe-migrate-upstream-CLAUDE.md` として保存
2. `diff` で変更箇所を表示
3. 自動マージを試みる（git merge-file）

```bash
cp "$TMPDIR/wardrobe-upstream/CLAUDE.md" ".claude/wardrobe-migrate-upstream-CLAUDE.md"
git merge-file CLAUDE.md .git/wardrobe-migrate-base-CLAUDE.md ".claude/wardrobe-migrate-upstream-CLAUDE.md" 2>/dev/null
```

コンフリクトが発生した場合:

```
[警告] CLAUDE.md にコンフリクトが発生しました。
       手動でマージしてください: CLAUDE.md
       アップストリーム版: .claude/wardrobe-migrate-upstream-CLAUDE.md
       コンフリクトマーカー（<<<<<<< / ======= / >>>>>>>）を検索して解消してください。
```

コンフリクトがない場合は自動マージされた CLAUDE.md を適用する。

### 5-4. MCP サーバーの適用

MCP サーバーディレクトリ（memory-mcp/, hearing/, tts-mcp/ 等）は大きな変更になりうるため、**diff を表示して手動確認を求める**:

```bash
diff -r "$TMPDIR/wardrobe-upstream/memory-mcp/" "memory-mcp/" 2>/dev/null
```

```
[MCP サーバー更新の確認が必要です]
memory-mcp/ に変更があります（上記 diff 参照）。
依存関係やデータベーススキーマの変更を含む可能性があります。

適用しますか？ (y/N)
```

y の場合のみ rsync で同期する:

```bash
rsync -av --delete \
  --exclude="*.db" \
  --exclude=".venv/" \
  --exclude="__pycache__/" \
  "$TMPDIR/wardrobe-upstream/memory-mcp/" "memory-mcp/"
```

---

## Phase 6 — 完了

### 6-1. wardrobe-lock.json の更新

```bash
bun -e "
const lock = {
  version: '$(cat $TMPDIR/wardrobe-upstream/package.json | bun -e \"const p=JSON.parse(await Bun.stdin.text()); console.log(p.version || '0.1.0')\" 2>/dev/null || echo '0.1.0')',
  commit: '$UPSTREAM_COMMIT',
  updated_at: '$(date +%Y-%m-%d)',
  repository: 'https://github.com/fruitriin/embodied-claude-wardrobe.git'
};
await Bun.write('.claude/wardrobe-lock.json', JSON.stringify(lock, null, 2) + '\n');
console.log('wardrobe-lock.json 更新完了');
"
```

### 6-2. 一時ディレクトリの削除

```bash
rm -rf "$TMPDIR"
```

### 6-3. 完了レポート

```
=== wardrobe-migrate 完了 ===

適用: N 件のファイルを更新
スキップ: M 件（保護済み）
警告: K 件

コミットを推奨します:
  git add -A
  git commit -m "chore: wardrobe migrate to $UPSTREAM_COMMIT"

変更内容を確認してください:
  git diff HEAD
```

---

## 注意事項

- **マイグレーション前に必ず git commit または stash しておくこと**
- MCP サーバーの変更後は再起動が必要: `claude mcp restart <server-name>`
- `settings.json` のマージ後に意図しない権限変更がないか確認すること
- `CLAUDE.md` のコンフリクト解消後は必ず動作確認すること

入力: $ARGUMENTS
