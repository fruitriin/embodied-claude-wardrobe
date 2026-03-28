#!/usr/bin/env python3
"""PostgreSQL → SQLite+numpy migration script.

Usage:
    cd memory-mcp
    uv run python scripts/migrate_postgres_to_sqlite.py \
        --pg-dsn "postgresql://memory_mcp:PASSWORD@localhost:14432/embodied_claude" \
        --dest ~/.claude/memories/memory.db

What it does:
    1. Read all memories + embeddings from PostgreSQL (pgvector)
    2. Insert into SQLite memories + embeddings tables (numpy BLOB)
    3. Convert memory_links → memories.links JSON + linked_ids CSV
    4. Expand coactivation_weights (symmetric → directed pairs)
    5. Migrate episodes (aggregating memory_ids from memories)

Requires:
    pip install psycopg2-binary pgvector numpy
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path  # noqa: I001

# ---------------------------------------------------------------------------
# Inline normalizer (from kmizu/main normalizer.py)
# ---------------------------------------------------------------------------

_HYPHEN_RE = re.compile(
    r"[-\u2010\u2011\u2012\u2013\u2014\u2015\u207B\u208B\u2212\uFE63\uFF0D]"
)

_SMALL_KANA = str.maketrans(
    {
        "ァ": "ア", "ィ": "イ", "ゥ": "ウ", "ェ": "エ", "ォ": "オ",
        "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お",
    }
)

_sudachi_tokenizer = None


def _get_sudachi_tokenizer():
    global _sudachi_tokenizer
    if _sudachi_tokenizer is None:
        try:
            import sudachipy.dictionary as sudachi_dict
            dic = sudachi_dict.Dictionary()
            _sudachi_tokenizer = dic.create()
        except Exception:
            _sudachi_tokenizer = False
    return _sudachi_tokenizer if _sudachi_tokenizer is not False else None


def normalize_japanese(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = (
        text.replace("ヴァ", "バ")
        .replace("ヴィ", "ビ")
        .replace("ヴェ", "ベ")
        .replace("ヴォ", "ボ")
        .replace("ヴ", "ブ")
    )
    text = _HYPHEN_RE.sub("ー", text)
    text = text.translate(_SMALL_KANA)
    text = text.lower()
    return text


def get_reading(text: str) -> str | None:
    tokenizer = _get_sudachi_tokenizer()
    if tokenizer is None:
        return None
    try:
        morphs = tokenizer.tokenize(text)
        return "".join(m.reading_form() for m in morphs)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# SQLite DDL (matches kmizu/main store.py)
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    normalized_content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    emotion TEXT NOT NULL DEFAULT 'neutral',
    importance INTEGER NOT NULL DEFAULT 3,
    category TEXT NOT NULL DEFAULT 'daily',
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed TEXT NOT NULL DEFAULT '',
    linked_ids TEXT NOT NULL DEFAULT '',
    episode_id TEXT,
    sensory_data TEXT NOT NULL DEFAULT '',
    camera_position TEXT,
    tags TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '',
    novelty_score REAL NOT NULL DEFAULT 0.0,
    prediction_error REAL NOT NULL DEFAULT 0.0,
    activation_count INTEGER NOT NULL DEFAULT 0,
    last_activated TEXT NOT NULL DEFAULT '',
    reading TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_emotion    ON memories(emotion);
CREATE INDEX IF NOT EXISTS idx_memories_category   ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp  ON memories(timestamp);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);

CREATE TABLE IF NOT EXISTS embeddings (
    memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    vector BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS coactivation (
    source_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    weight REAL NOT NULL CHECK(weight >= 0.0 AND weight <= 1.0),
    PRIMARY KEY (source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_coactivation_source ON coactivation(source_id);
CREATE INDEX IF NOT EXISTS idx_coactivation_target ON coactivation(target_id);

CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    memory_ids TEXT NOT NULL DEFAULT '',
    participants TEXT NOT NULL DEFAULT '',
    location_context TEXT,
    summary TEXT NOT NULL DEFAULT '',
    emotion TEXT NOT NULL DEFAULT 'neutral',
    importance INTEGER NOT NULL DEFAULT 3
);
"""


def _create_tables(conn: sqlite3.Connection) -> None:
    for stmt in _DDL.strip().split(";"):
        stmt = stmt.strip()
        if stmt:
            conn.execute(stmt)
    conn.commit()


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------

def _ts_to_iso(val) -> str:
    """Convert a PostgreSQL TIMESTAMPTZ to naive ISO string, or ''.

    kmizu/main store.py uses datetime.now() (naive) for time decay calculation,
    so we strip timezone info to avoid offset-naive vs offset-aware errors.
    """
    if val is None:
        return ""
    # Convert to UTC and strip tzinfo for naive datetime compatibility
    from datetime import timezone
    if val.tzinfo is not None:
        val = val.astimezone(timezone.utc).replace(tzinfo=None)
    return val.isoformat()


def _tags_to_csv(tags: list[str] | None) -> str:
    """Convert TEXT[] to comma-separated string."""
    if not tags:
        return ""
    return ",".join(tags)


def _participants_to_csv(participants: list[str] | None) -> str:
    """Convert TEXT[] to comma-separated string."""
    if not participants:
        return ""
    return ",".join(participants)


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def migrate(pg_dsn: str, dest: str, batch_size: int = 500) -> None:
    try:
        import numpy as np
        import psycopg2
        from pgvector.psycopg2 import register_vector
    except ImportError as e:
        print(f"Error: {e}")
        print("Install required packages: pip install psycopg2-binary pgvector numpy")
        sys.exit(1)

    dest_path = Path(dest).expanduser()
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"PostgreSQL: {pg_dsn}")
    print(f"Dest:       {dest_path}")
    print()

    # ── Connect PostgreSQL ──
    pg_conn = psycopg2.connect(pg_dsn)
    register_vector(pg_conn)
    pg_cur = pg_conn.cursor()

    # Count records
    pg_cur.execute("SELECT count(*) FROM memories")
    pg_memories_count = pg_cur.fetchone()[0]
    pg_cur.execute("SELECT count(*) FROM memory_links")
    pg_links_count = pg_cur.fetchone()[0]
    pg_cur.execute("SELECT count(*) FROM coactivation_weights")
    pg_coact_count = pg_cur.fetchone()[0]
    pg_cur.execute("SELECT count(*) FROM episodes")
    pg_episodes_count = pg_cur.fetchone()[0]

    print("PostgreSQL records:")
    print(f"  memories:             {pg_memories_count}")
    print(f"  memory_links:         {pg_links_count}")
    print(f"  coactivation_weights: {pg_coact_count}")
    print(f"  episodes:             {pg_episodes_count}")
    print()

    answer = input("Proceed with migration? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        sys.exit(0)

    # ── Open SQLite ──
    sqlite_conn = sqlite3.connect(str(dest_path), check_same_thread=False)
    sqlite_conn.execute("PRAGMA foreign_keys = ON")
    sqlite_conn.execute("PRAGMA journal_mode = WAL")
    _create_tables(sqlite_conn)

    # ── Step 1: Migrate memories + embeddings ──
    print("\nMigrating memories...")
    pg_cur.execute("""
        SELECT id, content, embedding, created_at, emotion, importance, category,
               access_count, last_accessed, episode_id, sensory_data,
               camera_position, tags, novelty_score, prediction_error,
               activation_count, last_activated
        FROM memories
        ORDER BY created_at
    """)

    memory_ids_set: set[str] = set()
    mem_inserted = 0
    emb_inserted = 0

    while True:
        rows = pg_cur.fetchmany(batch_size)
        if not rows:
            break
        for row in rows:
            (
                mid, content, embedding, created_at, emotion, importance, category,
                access_count, last_accessed, episode_id, sensory_data,
                camera_position, tags, novelty_score, prediction_error,
                activation_count, last_activated
            ) = row

            mid_str = str(mid)
            normalized = normalize_japanese(content)
            reading = get_reading(content)

            sqlite_conn.execute(
                """INSERT OR IGNORE INTO memories (
                    id, content, normalized_content, timestamp,
                    emotion, importance, category, access_count, last_accessed,
                    linked_ids, episode_id, sensory_data, camera_position,
                    tags, links, novelty_score, prediction_error,
                    activation_count, last_activated, reading
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    mid_str,
                    content,
                    normalized,
                    _ts_to_iso(created_at),
                    emotion,
                    int(importance),
                    category,
                    int(access_count),
                    _ts_to_iso(last_accessed),
                    "",  # linked_ids: populated later from memory_links
                    str(episode_id) if episode_id else None,
                    json.dumps(sensory_data) if sensory_data else "",
                    json.dumps(camera_position) if camera_position else None,
                    _tags_to_csv(tags),
                    "",  # links: populated later from memory_links
                    float(novelty_score),
                    float(prediction_error),
                    int(activation_count),
                    _ts_to_iso(last_activated),
                    reading,
                ),
            )
            memory_ids_set.add(mid_str)
            mem_inserted += 1

            # Embedding: pgvector list[float] → numpy float32 BLOB
            if embedding is not None:
                vec_bytes = np.array(embedding, dtype=np.float32).tobytes()
                sqlite_conn.execute(
                    "INSERT OR IGNORE INTO embeddings (memory_id, vector) VALUES (?,?)",
                    (mid_str, vec_bytes),
                )
                emb_inserted += 1

    sqlite_conn.commit()
    print(f"  Inserted {mem_inserted} memories, {emb_inserted} embeddings.")

    # ── Step 2: Convert memory_links → links JSON + linked_ids CSV ──
    print("\nConverting memory_links → links + linked_ids...")
    pg_cur.execute("""
        SELECT source_id, target_id, link_type, note
        FROM memory_links
        ORDER BY source_id
    """)

    # Build links dict: source_id → [{target_id, link_type, note}, ...]
    links_by_source: dict[str, list[dict]] = defaultdict(list)
    # Build linked_ids: bidirectional set for each memory
    linked_ids_map: dict[str, set[str]] = defaultdict(set)

    link_rows = pg_cur.fetchall()
    for source_id, target_id, link_type, note in link_rows:
        src = str(source_id)
        tgt = str(target_id)
        if src not in memory_ids_set or tgt not in memory_ids_set:
            continue
        links_by_source[src].append({
            "target_id": tgt,
            "link_type": link_type,
            **({"note": note} if note else {}),
        })
        # Bidirectional linked_ids
        linked_ids_map[src].add(tgt)
        linked_ids_map[tgt].add(src)

    # Update memories with links and linked_ids
    links_updated = 0
    for mid_str in memory_ids_set:
        links_json = json.dumps(links_by_source[mid_str]) if mid_str in links_by_source else ""
        linked_csv = ",".join(sorted(linked_ids_map[mid_str])) if mid_str in linked_ids_map else ""
        if links_json or linked_csv:
            sqlite_conn.execute(
                "UPDATE memories SET links = ?, linked_ids = ? WHERE id = ?",
                (links_json, linked_csv, mid_str),
            )
            links_updated += 1
    sqlite_conn.commit()
    print(f"  Updated {links_updated} memories with links/linked_ids.")

    # ── Step 3: Expand coactivation_weights (symmetric → directed) ──
    print("\nExpanding coactivation_weights (symmetric → directed)...")
    pg_cur.execute("SELECT memory_a, memory_b, weight FROM coactivation_weights")

    coact_inserted = 0
    for memory_a, memory_b, weight in pg_cur.fetchall():
        a_str = str(memory_a)
        b_str = str(memory_b)
        if a_str not in memory_ids_set or b_str not in memory_ids_set:
            continue
        w = max(0.0, min(1.0, float(weight)))
        # Insert both directions
        sqlite_conn.execute(
            "INSERT OR IGNORE INTO coactivation (source_id, target_id, weight) VALUES (?,?,?)",
            (a_str, b_str, w),
        )
        sqlite_conn.execute(
            "INSERT OR IGNORE INTO coactivation (source_id, target_id, weight) VALUES (?,?,?)",
            (b_str, a_str, w),
        )
        coact_inserted += 2
    sqlite_conn.commit()
    print(f"  Inserted {coact_inserted} coactivation rows (from {pg_coact_count} symmetric pairs).")

    # ── Step 4: Migrate episodes ──
    print("\nMigrating episodes...")

    # Build episode_id → [memory_id, ...] map from memories
    episode_memories: dict[str, list[str]] = defaultdict(list)
    pg_cur.execute("SELECT id, episode_id FROM memories WHERE episode_id IS NOT NULL")
    for mid, eid in pg_cur.fetchall():
        episode_memories[str(eid)].append(str(mid))

    pg_cur.execute("""
        SELECT id, title, start_time, end_time, participants,
               location_context, summary, emotion, importance
        FROM episodes
        ORDER BY start_time
    """)

    ep_inserted = 0
    for row in pg_cur.fetchall():
        (
            eid, title, start_time, end_time, participants,
            location_context, summary, emotion, importance
        ) = row

        eid_str = str(eid)
        memory_ids_csv = ",".join(episode_memories.get(eid_str, []))

        sqlite_conn.execute(
            """INSERT OR IGNORE INTO episodes
               (id, title, start_time, end_time, memory_ids, participants,
                location_context, summary, emotion, importance)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                eid_str,
                title,
                _ts_to_iso(start_time),
                _ts_to_iso(end_time) or None,
                memory_ids_csv,
                _participants_to_csv(participants),
                location_context,
                summary,
                emotion,
                int(importance),
            ),
        )
        ep_inserted += 1
    sqlite_conn.commit()
    print(f"  Inserted {ep_inserted} episodes.")

    # ── Verification report ──
    sqlite_cur = sqlite_conn.cursor()
    sqlite_cur.execute("SELECT count(*) FROM memories")
    sq_mem = sqlite_cur.fetchone()[0]
    sqlite_cur.execute("SELECT count(*) FROM embeddings")
    sq_emb = sqlite_cur.fetchone()[0]
    sqlite_cur.execute("SELECT count(*) FROM coactivation")
    sq_coact = sqlite_cur.fetchone()[0]
    sqlite_cur.execute("SELECT count(*) FROM episodes")
    sq_ep = sqlite_cur.fetchone()[0]

    def _match(expected, actual):
        return "OK" if expected == actual else "MISMATCH"

    coact_ok = pg_coact_count * 2 == sq_coact or pg_coact_count == 0

    print("\n" + "=" * 50)
    print("Verification report")
    print("=" * 50)
    hdr = f"{'':24} {'PostgreSQL':>10} {'SQLite':>10} {'Match':>10}"
    print(hdr)
    print(f"{'memories':24} {pg_memories_count:>10} {sq_mem:>10}"
          f" {_match(pg_memories_count, sq_mem):>10}")
    print(f"{'embeddings':24} {pg_memories_count:>10} {sq_emb:>10}"
          f" {_match(pg_memories_count, sq_emb):>10}")
    print(f"{'coactivation (2x)':24} {pg_coact_count:>10} {sq_coact:>10}"
          f" {'OK' if coact_ok else 'CHECK':>10}")
    print(f"{'episodes':24} {pg_episodes_count:>10} {sq_ep:>10}"
          f" {_match(pg_episodes_count, sq_ep):>10}")
    print(f"{'memory_links':24} {pg_links_count:>10}"
          f" {links_updated:>10} {'converted':>10}")

    # Cleanup
    pg_cur.close()
    pg_conn.close()
    sqlite_conn.close()

    print("\nMigration complete!")
    print(f"SQLite database: {dest_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate memory-mcp data from PostgreSQL to SQLite+numpy"
    )
    parser.add_argument(
        "--pg-dsn",
        required=True,
        help='PostgreSQL DSN (e.g. "postgresql://user:pass@localhost:5432/dbname")',
    )
    parser.add_argument(
        "--dest",
        default=str(Path.home() / ".claude" / "memories" / "memory.db"),
        help="Path to SQLite output file (default: ~/.claude/memories/memory.db)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Batch size for fetching rows (default: 500)",
    )
    args = parser.parse_args()
    migrate(pg_dsn=args.pg_dsn, dest=args.dest, batch_size=args.batch_size)


if __name__ == "__main__":
    main()
