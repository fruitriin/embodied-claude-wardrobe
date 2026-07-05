# PGroonga + pgvector on Postgres 16 (Alpine)
#
# ベースは PGroonga 公式 Alpine 版。pgvector は同梱されないので、
# ここでソースからビルドして拡張だけ追加する。
# Supabase 側は PGroonga と pgvector が両方使えるので、
# 「Supabase で動くローカル同等物」を作るのが狙い。
#
# LLVM/clang のバージョン: base image (postgres:16-alpine on Alpine 3.23)
# は `--with-llvm LLVM_CONFIG=/usr/lib/llvm19/bin/llvm-config CLANG=clang-19` で
# コンパイルされているので、pgvector 側も llvm19/clang19 に合わせる。
# バージョンが合わないと Makefile が `clang-19: not found` で落ちる。

# slim 版は postgres の C ヘッダを含まないので、pgvector をソースビルドする本用途では
# 通常の alpine 版（ヘッダ入り）を使う。
FROM groonga/pgroonga:latest-alpine-16

ARG PGVECTOR_VERSION=v0.8.0

USER root

RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
        build-base \
        clang19 \
        llvm19-dev \
        git \
        openssl-dev \
    ; \
    cd /tmp; \
    git clone --branch "${PGVECTOR_VERSION}" --depth 1 https://github.com/pgvector/pgvector.git; \
    cd pgvector; \
    make; \
    make install; \
    cd /; \
    rm -rf /tmp/pgvector; \
    apk del .build-deps

# 検証: 両拡張の control ファイルが揃っていること
RUN ls -1 /usr/local/share/postgresql/extension/ | grep -E '^(pgroonga|vector)\.control$'
