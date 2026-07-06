# postgres-memory — Postgres バックエンドの記憶 MCP

> Wardrobe の memory-mcp を **Postgres + PGroonga + pgvector** で再実装するプロジェクト。
> このディレクトリは **Phase 0（PR#1）: スキーマまで** の成果物を格納する。
> MCP サーバー本体の Python 実装は **PR#2 以降** で追加する。

## なぜ Postgres 版か

- **日本語全文検索を PGroonga に任せる**（自前 BM25+読み仮名の実装を持たなくてよくなる）
- **ベクトル検索を pgvector HNSW に任せる**（numpy BLOB 全件走査から DB 内 cosine へ）
- **マルチセッション同時接続**（朔・シロエ・王・商会が同時に触れる）
- **Supabase をそのまま本番に使える**——PGroonga と pgvector が両方使える（ほぼ唯一の）マネージド Postgres。ここで動くものはそのまま Web 経路にも載る

背景と設計判断の全体像は `docs/plans/remote-memory-mcp.md` を参照。

## 現在の Phase

**Phase 0: Docker で Postgres が起動し、スキーマが適用されるところまで**

| 項目 | ステータス |
|---|---|
| Memory Tool Contract の棚卸し | ✅ `docs/plans/postgres-memory/contract-inventory.md` |
| PGroonga + pgvector 入り Docker イメージ | ✅ `docker/Dockerfile` |
| Postgres 起動セット | ✅ `docker/docker-compose.yml` |
| スキーマ DDL（memories/embeddings/links/episodes） | ✅ `sql/schema/001_init.sql` |
| smoke test（日本語 PGroonga 検索 + pgvector 距離） | ✅ `scripts/smoke.sh` |
| MCP サーバー実装 | ⏳ PR#2 |
| SQLite → PG マイグレーション | ⏳ PR#2 |

## ローカル起動手順

前提: Docker Desktop または互換ランタイム。macOS で確認済み（Docker 29.x / Compose v2）。

```bash
cd .claude/mcps/postgres-memory

# 1. Postgres を起動（初回は PGroonga + pgvector のビルドで 3-5 分）
./scripts/pg-up.sh

# 2. スキーマを適用
./scripts/pg-psql.sh -f ./sql/schema/001_init.sql

# 3. smoke test（拡張ロード確認 + 日本語検索 + pgvector 距離）
./scripts/smoke.sh
```

停止:

```bash
./scripts/pg-down.sh          # コンテナだけ止める（データは保持）
./scripts/pg-down.sh --wipe   # ボリュームごと削除（初期化）
```

対話 psql:

```bash
./scripts/pg-psql.sh
```

## ディレクトリ構成

```
.claude/mcps/postgres-memory/
├── README.md                       # このファイル
├── docker/
│   ├── Dockerfile                  # PGroonga + pgvector（clang19/llvm19 でビルド）
│   ├── docker-compose.yml
│   └── .env.example                # cp して .env として使う
├── scripts/
│   ├── pg-up.sh                    # 起動 + healthcheck 待ち
│   ├── pg-down.sh                  # 停止（--wipe でボリュームも削除）
│   ├── pg-psql.sh                  # psql をコンテナ内で叩く
│   └── smoke.sh                    # Phase 0 smoke test
└── sql/
    └── schema/
        └── 001_init.sql            # 初期スキーマ
```

## 設計メモ

### 拡張構成

- **PGroonga**: content / normalized_content / reading を独立にインデックス。日本語形態素と N-gram の両方が使える
- **pgvector**: `vector(768)` + HNSW cosine。次元は PR#2 で埋め込みモデルを確定するとき見直す
- **uuid-ossp**: memory の主キーに uuid_generate_v4()

### 「最初から入れておく」もの

- **EvidenceType**（observed/inferred/remembered/heard/assumed）: `docs/plans/external-intake-2026-07.md` Tier 3 由来。1カラム追加で「観察と推論を混同しない」を得られる
- **tags text[]**: 現行 memory-mcp では暗黙のメタ扱いだったが、GIN インデックスを張って主権化
- **schema_versions**: マイグレーション履歴を DB 内で持つ

### 「まだ入れない」もの

- **Row Level Security (RLS)**: Phase 3（Supabase 化）で必要になる
- **ペルソナ分離**（DB or schema 単位）: PR#2 or Phase 3 で判断
- **FLASH.md 具現化ビュー** (`get_flash_index`): Phase 2 末 or Phase 3

## 次に来る職人へ（PR#2 の入り口）

1. `.claude/mcps/postgres-memory/src/` に Python パッケージ `postgres_memory_mcp` を作る（stdio MCP）
2. `docs/plans/postgres-memory/contract-inventory.md` の「最小契約 11ツール」を実装
3. SQLite → PG のマイグレーションスクリプト（既存 `~/.claude/memory-mcp/*.db` からの全件輸入、非破壊）
4. 埋め込みモデルを確定して `embeddings.vector` の次元を fix（現行 768 のまま行けるか要確認）

## 参照

- `docs/plans/remote-memory-mcp.md` — 設計の正
- `docs/plans/postgres-memory/contract-inventory.md` — Contract 棚卸し
- `docs/plans/external-intake-2026-07.md` — Tier 3 の輸入候補（EvidenceType など）
- `docs/plans/memory-mcp-enhancements.md` — 既存 Memory-MCP 圏計画
