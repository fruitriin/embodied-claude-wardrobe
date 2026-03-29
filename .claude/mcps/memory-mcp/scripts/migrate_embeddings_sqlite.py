#!/usr/bin/env python3
"""SQLite の埋め込みを現在のモデル (intfloat/multilingual-e5-base, 768次元) で再計算するスクリプト。

使い方:
    cd memory-mcp
    uv run python scripts/migrate_embeddings_sqlite.py

注意:
    - embeddings テーブルの全ベクトルを現在のモデルで再計算する
    - 実行前にバックアップ推奨: cp memory.db memory.db.bak
    - verb_chain_embeddings も同様に再計算する
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from memory_mcp.config import MemoryConfig
from memory_mcp.embedding import E5EmbeddingFunction
from memory_mcp.normalizer import normalize_japanese
from memory_mcp.vector import decode_vector, encode_vector


def migrate(config: MemoryConfig) -> None:
    db_path = config.db_path
    print(f"DB パス: {db_path}")
    print(f"埋め込みモデル: {config.embedding_model}")

    # 自動バックアップ
    import shutil
    backup_path = db_path + ".bak"
    shutil.copy2(db_path, backup_path)
    print(f"バックアップ作成: {backup_path}")

    conn = sqlite3.connect(db_path)

    # 現在の次元数を確認
    row = conn.execute("SELECT vector FROM embeddings LIMIT 1").fetchone()
    if not row:
        print("埋め込みが0件です。移行不要。")
        return
    old_dim = np.frombuffer(row[0], dtype=np.float32).shape[0]

    # モデルをロード
    print("モデルをロード中...")
    ef = E5EmbeddingFunction(config.embedding_model)
    ef._load_model()
    test_vec = ef(["test"])[0]
    new_dim = len(test_vec)
    print(f"現在の DB: {old_dim}次元 → モデル: {new_dim}次元")

    if old_dim == new_dim:
        print("次元数が一致しています。移行不要。")
        return

    # 記憶の内容を取得
    rows = conn.execute(
        "SELECT e.memory_id, m.normalized_content "
        "FROM embeddings e JOIN memories m ON e.memory_id = m.id"
    ).fetchall()
    total = len(rows)
    print(f"移行対象: {total} 件")
    print()

    answer = input("続行しますか？ (y/N): ")
    if answer.strip().lower() != "y":
        print("キャンセルしました。")
        return

    # バッチで再 embedding
    batch_size = 32
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        memory_ids = [r[0] for r in batch]
        texts = [r[1] or "" for r in batch]

        vectors = ef(texts)

        for mid, vec in zip(memory_ids, vectors):
            blob = encode_vector(vec)
            conn.execute(
                "UPDATE embeddings SET vector = ? WHERE memory_id = ?",
                (blob, mid),
            )

        done = min(i + batch_size, total)
        print(f"  embeddings: {done}/{total} 件完了", end="\r", flush=True)

    conn.commit()
    print(f"\nembeddings: {total} 件を {new_dim}次元で再計算しました。")

    # verb_chain_embeddings も処理
    vc_rows = conn.execute(
        "SELECT chain_id, summary FROM verb_chain_embeddings ve "
        "JOIN verb_chains vc ON ve.chain_id = vc.id"
    ).fetchall()
    if vc_rows:
        vc_total = len(vc_rows)
        print(f"\nverb_chain_embeddings: {vc_total} 件を再計算中...")
        for i in range(0, vc_total, batch_size):
            batch = vc_rows[i : i + batch_size]
            chain_ids = [r[0] for r in batch]
            texts = [r[1] or "" for r in batch]
            vectors = ef(texts)
            for cid, vec in zip(chain_ids, vectors):
                blob = encode_vector(vec)
                conn.execute(
                    "UPDATE verb_chain_embeddings SET vector = ? WHERE chain_id = ?",
                    (blob, cid),
                )
            done = min(i + batch_size, vc_total)
            print(f"  verb_chains: {done}/{vc_total} 件完了", end="\r", flush=True)
        conn.commit()
        print(f"\nverb_chain_embeddings: {vc_total} 件完了。")
    else:
        print("\nverb_chain_embeddings: 0件（スキップ）")

    conn.close()
    print("\n移行完了！")


def main() -> None:
    config = MemoryConfig.from_env()
    migrate(config)


if __name__ == "__main__":
    main()
