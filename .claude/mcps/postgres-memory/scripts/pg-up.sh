#!/usr/bin/env bash
# Postgres コンテナを起動する。初回は Docker build（PGroonga + pgvector）で数分かかる。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/../docker"

cd "${DOCKER_DIR}"

if [[ ! -f .env ]]; then
    echo "[pg-up] .env が無いので .env.example から複製します"
    cp .env.example .env
fi

docker compose up -d --build

echo "[pg-up] healthcheck 待ち..."
# healthcheck が healthy になるまで待つ（最大60秒）
for i in $(seq 1 60); do
    status=$(docker inspect --format='{{.State.Health.Status}}' wardrobe-postgres-memory 2>/dev/null || echo "unknown")
    if [[ "${status}" == "healthy" ]]; then
        echo "[pg-up] Postgres is healthy"
        exit 0
    fi
    sleep 1
done

echo "[pg-up] タイムアウト。docker compose logs postgres を確認してください" >&2
exit 1
