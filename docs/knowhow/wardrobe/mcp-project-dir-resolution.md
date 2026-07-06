# MCP サーバーのプロジェクトルート解決 — ${PWD} 汚染と2段防御

## わかったこと

- `.mcp.json` の `env` に書いた `${PWD}` は、**Claude Code セッションの cwd ではなく、Claude Code プロセスが親（VSCode 等のエディタ）から継承した環境変数 `PWD`** で展開されることがある
- エディタが別プロジェクトの文脈で起動していると、MCP サーバーは**他所のプロジェクトのデータに読み書きする**。実測では memory-mcp が別リポジトリの worktree 配下の `memory.db` に記憶を書き込み、「DB はあるのに記憶が見えない／別の記憶が見える」という食い違いとして現れた
- 一方、`args` の `uv run --directory .claude/mcps/xxx`（相対パス）は**セッション cwd 基準で正しく解決される**。つまり MCP サーバー自身の cwd は信頼できる錨（アンカー）になる

## 2段防御

1. **`.mcp.json` で `${PWD}` に依存しない** — `CLAUDE_PROJECT_DIR: "${PWD}"` のような env 注入を撤去する。サーバー側が自分の cwd からプロジェクトルートを解決できるなら env は不要
2. **サーバー側 config で `CLAUDE_PROJECT_DIR` を無条件に信じない** — 以下の優先順位で解決する:
   - env が指すディレクトリの**配下に自分の cwd があるか**を検証。なければその env は継承汚染とみなす
   - 汚染時・env 欠落時は、cwd から祖先方向に `CLAUDE.md` マーカーを探索してプロジェクトルートとする
   - マーカーも見つからない（プロジェクト外設置）場合のみ env を信じ、それもなければホームに退避

実装例: `.claude/mcps/memory-mcp/src/memory_mcp/config.py` の `_resolve_project_dir()`、テストは `tests/test_config.py`（正常 env / 汚染 env / env なしマーカー探索 / プロジェクト外 / 全滅時ホーム退避の6ケース）。

## 診断手順 — 「応答と実体が食い違う」とき

MCP の返す内容とプロジェクト内のファイル実体が合わないときは、プロセスの実態を直接見る:

```bash
pgrep -fl <server-name>          # サーバープロセスの PID を特定
lsof -p <PID> | grep '\.db'      # 実際に開いているファイルを特定
lsof -p <PID> -a -d cwd          # プロセスの cwd を確認
ps eww <PID> | tr ' ' '\n' | grep CLAUDE_PROJECT_DIR   # env の実値を確認
```

「サーバーコードは正常なのに接続・応答がおかしい」という症状は、コードではなく**プロセスに渡った env** が原因のことがある。

## 気をつけること

- 誤配置されたデータを救出するときは、両 DB のバックアップ（`sqlite3 .backup`、WAL も統合される）→ `ATTACH` で行コピー → 検証 → 元 DB から削除、の順。削除を先にしない
- サーバープロセスは接続時の DB を掴んだままなので、修正後は **MCP の再接続（またはセッション再起動）まで書き込み先は直らない**。再接続前に記憶を刻むと再び他所に書く
- `claude-code/mcp.md` の旧記述（`${PWD}` を全 MCP に渡す設定例）はこの知見で置き換えられた

## 参照

- [claude-code/mcp.md](../claude-code/mcp.md) — .mcp.json の一般仕様（環境変数展開は 1.0.48〜）
- [timestamp-policy.md](timestamp-policy.md) — 同じく memory-mcp の運用地雷（TZ 混在）
