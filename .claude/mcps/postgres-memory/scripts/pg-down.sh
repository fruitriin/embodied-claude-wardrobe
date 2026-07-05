#!/usr/bin/env bash
# Postgres コンテナを停止する。--wipe でボリュームごと削除する。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/../docker"

cd "${DOCKER_DIR}"

if [[ "${1:-}" == "--wipe" ]]; then
    echo "[pg-down] コンテナとボリュームを削除します"
    docker compose down -v
else
    docker compose down
fi
