#!/usr/bin/env bash
# コンテナ内の psql を叩く。追加引数はそのまま psql に渡す。
#   例: ./pg-psql.sh                       -> interactive
#       ./pg-psql.sh -c 'SELECT 1'          -> ワンショット
#       ./pg-psql.sh -f ../sql/schema/001_init.sql
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/../docker"

# .env 読み込み（POSTGRES_USER / DB を拾うため）
if [[ -f "${DOCKER_DIR}/.env" ]]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' "${DOCKER_DIR}/.env" | xargs -I{} echo {})
fi

USER="${POSTGRES_USER:-wardrobe}"
DB="${POSTGRES_DB:-wardrobe_memory}"

# -f でファイルを渡された場合はコンテナに流し込む。
# それ以外の引数は psql にそのまま渡す。
if [[ "${1:-}" == "-f" && -n "${2:-}" ]]; then
    file="$2"
    shift 2
    docker exec -i wardrobe-postgres-memory psql -U "${USER}" -d "${DB}" "$@" < "${file}"
else
    docker exec -i wardrobe-postgres-memory psql -U "${USER}" -d "${DB}" "$@"
fi
