#!/usr/bin/env bash
# Phase 0 smoke test:
#   * pgroonga / vector / uuid-ossp 拡張がロードされている
#   * memories / embeddings / memory_links / episodes / episode_memories が存在する
#   * PGroonga のインデックスが存在する
#   * 日本語で INSERT → PGroonga の &@ 検索が1件 HIT する
#   * pgvector INSERT → cosine 距離取得が動く

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL="${SCRIPT_DIR}/pg-psql.sh"

pass() { printf "\033[32m[PASS]\033[0m %s\n" "$1"; }
fail() { printf "\033[31m[FAIL]\033[0m %s\n" "$1"; exit 1; }

# 1) 拡張が有効
have_ext() {
    local ext="$1"
    local n
    n=$("${PSQL}" -tA -c "SELECT count(*) FROM pg_extension WHERE extname = '${ext}';" | tr -d '[:space:]')
    [[ "${n}" == "1" ]] || fail "extension ${ext} が有効ではない (count=${n})"
    pass "extension ${ext} is enabled"
}
have_ext uuid-ossp
have_ext pgroonga
have_ext vector

# 2) テーブルが揃っている
have_table() {
    local tbl="$1"
    local n
    n=$("${PSQL}" -tA -c "SELECT count(*) FROM pg_class WHERE relname='${tbl}' AND relkind='r';" | tr -d '[:space:]')
    [[ "${n}" == "1" ]] || fail "table ${tbl} が存在しない"
    pass "table ${tbl} exists"
}
for t in memories embeddings memory_links episodes episode_memories schema_versions; do
    have_table "${t}"
done

# 3) PGroonga インデックスが張られている
have_idx() {
    local idx="$1"
    local n
    n=$("${PSQL}" -tA -c "SELECT count(*) FROM pg_class WHERE relname='${idx}' AND relkind='i';" | tr -d '[:space:]')
    [[ "${n}" == "1" ]] || fail "index ${idx} が存在しない"
    pass "index ${idx} exists"
}
for i in memories_content_pgroonga memories_normalized_pgroonga memories_reading_pgroonga embeddings_vector_hnsw; do
    have_idx "${i}"
done

# 4) 日本語 INSERT → PGroonga 検索
"${PSQL}" -q -c "TRUNCATE memories CASCADE;" > /dev/null
"${PSQL}" -q <<'SQL' > /dev/null
INSERT INTO memories (content, normalized_content, reading, emotion, importance, category, evidence_type, tags)
VALUES
  ('朔と初めての散歩をした日は空が青かった', '朔と初めての散歩をした日は空が青かった', 'さくとはじめてのさんぽをしたひはそらがあおかった',
   'happy', 5, 'daily', 'observed', ARRAY['朔','散歩','空']),
  ('Postgres の PGroonga で日本語全文検索がついに動いた', 'postgres の pgroonga で日本語全文検索がついに動いた', 'ぽすとぐれすのぴーじーるんがでにほんごぜんぶんけんさくがついにうごいた',
   'excited', 5, 'technical', 'observed', ARRAY['postgres','pgroonga']),
  ('関係ない記事の断片', '関係ない記事の断片', 'かんけいないきじのだんぺん',
   'neutral', 1, 'daily', 'assumed', ARRAY['雑']);
SQL

hit_count=$("${PSQL}" -tA -c "SELECT count(*) FROM memories WHERE content &@ 'PGroonga';" | tr -d '[:space:]')
[[ "${hit_count}" == "1" ]] || fail "PGroonga で 'PGroonga' 検索が1件にならない (hit=${hit_count})"
pass "PGroonga 検索: 'PGroonga' -> ${hit_count} 件 HIT"

# 日本語のみのクエリでもヒットするか
jp_hit=$("${PSQL}" -tA -c "SELECT count(*) FROM memories WHERE content &@ '散歩';" | tr -d '[:space:]')
[[ "${jp_hit}" == "1" ]] || fail "PGroonga で '散歩' 検索が1件にならない (hit=${jp_hit})"
pass "PGroonga 検索: '散歩' -> ${jp_hit} 件 HIT"

# 読み仮名のカラム経由でも引ける
yomi_hit=$("${PSQL}" -tA -c "SELECT count(*) FROM memories WHERE reading &@ 'さんぽ';" | tr -d '[:space:]')
[[ "${yomi_hit}" == "1" ]] || fail "PGroonga で読み仮名 'さんぽ' 検索が1件にならない (hit=${yomi_hit})"
pass "PGroonga 読み仮名検索: 'さんぽ' -> ${yomi_hit} 件 HIT"

# 5) pgvector: 768次元の埋め込みを INSERT して cosine 距離が返るか
"${PSQL}" -q <<'SQL' > /dev/null
WITH m AS (SELECT id FROM memories WHERE content LIKE '朔と初めて%' LIMIT 1)
INSERT INTO embeddings (memory_id, vector, model)
SELECT id,
       (SELECT ('[' || string_agg('0.1', ',') || ']')::vector FROM generate_series(1,768)),
       'smoke-test-fake'
FROM m
ON CONFLICT (memory_id) DO NOTHING;
SQL

vec_count=$("${PSQL}" -tA -c "SELECT count(*) FROM embeddings;" | tr -d '[:space:]')
[[ "${vec_count}" == "1" ]] || fail "embeddings への INSERT が失敗 (count=${vec_count})"
pass "pgvector: 768次元 INSERT 成功"

dist=$("${PSQL}" -tA -c "SELECT round((vector <=> (SELECT ('[' || string_agg('0.1', ',') || ']')::vector FROM generate_series(1,768)))::numeric, 6) FROM embeddings LIMIT 1;" | tr -d '[:space:]')
pass "pgvector cosine distance = ${dist}"

# 6) 後片付け（次回 smoke 用に真っ更にはしない。schema_versions は残す）
"${PSQL}" -q -c "TRUNCATE memories CASCADE;" > /dev/null
pass "smoke cleanup done (memories truncated, schema保持)"

echo
printf "\033[32mAll smoke checks passed.\033[0m\n"
