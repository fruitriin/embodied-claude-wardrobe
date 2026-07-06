-- ============================================================================
-- Wardrobe Postgres Memory — スキーマ初版 (Phase 0 / PR#1)
-- ============================================================================
--
-- 設計方針:
--   * 現行 memory-mcp の Memory Tool Contract 最小11ツールを満たせる形。
--   * PGroonga: content / normalized_content / reading の日本語全文検索が主軸。
--   * pgvector: HNSW cosine で意味的想起。
--   * EvidenceType (observed/inferred/remembered/heard/assumed) は Tier 3 の
--     external-intake で「1フィールド追加で軽い」と評価されているので最初から入れる。
--   * ペルソナ分離は将来スキーマ単位で切る前提。今は public に置く。
--   * embedding 次元は 768 固定 (chiVe / gte-base 系を想定)。次元は PR#2 で確定させる。
--
-- 参考:
--   docs/plans/remote-memory-mcp.md
--   docs/plans/postgres-memory/contract-inventory.md
--   docs/plans/external-intake-2026-07.md (Tier 3)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgroonga;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- ENUM 相当は text + CHECK。ALTER で拡張しやすい形にしておく（EvidenceType など
-- 将来の増加を織り込む）。
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- memories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
    id                  uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
    content             text           NOT NULL,
    -- 正規化済み本文（半角化・小文字化・記号除去などフロント側で調整）。
    -- PGroonga のインデックスで content と併走させる。
    normalized_content  text,
    -- 読み仮名（ひらがな化）。BM25+読み仮名の代替として PGroonga に食わせる。
    reading             text,

    timestamp           timestamptz    NOT NULL DEFAULT now(),

    emotion             text           NOT NULL DEFAULT 'neutral'
        CHECK (emotion IN (
            'happy', 'sad', 'surprised', 'moved', 'excited',
            'nostalgic', 'curious', 'neutral'
        )),

    importance          smallint       NOT NULL DEFAULT 3
        CHECK (importance BETWEEN 1 AND 5),

    category            text           NOT NULL DEFAULT 'daily'
        CHECK (category IN (
            'daily', 'philosophical', 'technical', 'memory',
            'observation', 'feeling', 'conversation'
        )),

    -- upstream Tier 3 由来。「観察」と「推論」を混同しないための1フィールド。
    -- null 許容にして既存記憶の後方互換を保つ。
    evidence_type       text
        CHECK (evidence_type IS NULL OR evidence_type IN (
            'observed', 'inferred', 'remembered', 'heard', 'assumed'
        )),

    tags                text[]         NOT NULL DEFAULT '{}',

    access_count        integer        NOT NULL DEFAULT 0,
    last_accessed       timestamptz,

    created_at          timestamptz    NOT NULL DEFAULT now(),
    updated_at          timestamptz    NOT NULL DEFAULT now()
);

-- 全文検索: PGroonga で content / normalized_content / reading をまとめて扱う。
-- 3カラム個別インデックスにするか合成にするかは Phase 1 で確定する。
-- 現時点は運用の素直さを優先し、それぞれ独立に張っておく。
CREATE INDEX IF NOT EXISTS memories_content_pgroonga
    ON memories USING pgroonga (content);
CREATE INDEX IF NOT EXISTS memories_normalized_pgroonga
    ON memories USING pgroonga (normalized_content);
CREATE INDEX IF NOT EXISTS memories_reading_pgroonga
    ON memories USING pgroonga (reading);

-- 絞り込み軸の btree
CREATE INDEX IF NOT EXISTS memories_timestamp_idx
    ON memories (timestamp DESC);
CREATE INDEX IF NOT EXISTS memories_category_idx
    ON memories (category);
CREATE INDEX IF NOT EXISTS memories_importance_idx
    ON memories (importance);
CREATE INDEX IF NOT EXISTS memories_emotion_idx
    ON memories (emotion);
CREATE INDEX IF NOT EXISTS memories_evidence_type_idx
    ON memories (evidence_type) WHERE evidence_type IS NOT NULL;

-- タグの GIN（tags[] に対する @> 検索）
CREATE INDEX IF NOT EXISTS memories_tags_gin
    ON memories USING gin (tags);

-- updated_at 自動更新トリガ
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memories_set_updated_at ON memories;
CREATE TRIGGER memories_set_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- embeddings
-- ---------------------------------------------------------------------------
-- memory 1件に 1埋め込みを想定 (PK = FK)。将来モデルの複数版を持つなら
-- (memory_id, model) 複合キーに拡張する。
CREATE TABLE IF NOT EXISTS embeddings (
    memory_id   uuid            PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    vector      vector(768)     NOT NULL,
    -- どのモデルで作った埋め込みか（chiVe / gte-base / gte-small など）
    model       text            NOT NULL DEFAULT 'unknown',
    created_at  timestamptz     NOT NULL DEFAULT now()
);

-- HNSW cosine index。実運用の m/ef_construction は tuning 対象。
-- Phase 1 の段階では既定値でよい。
CREATE INDEX IF NOT EXISTS embeddings_vector_hnsw
    ON embeddings USING hnsw (vector vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- memory_links
-- ---------------------------------------------------------------------------
-- 因果 / 類似 / 関連リンク。上流方向・下流方向のトラバースを SQL で書けるように。
CREATE TABLE IF NOT EXISTS memory_links (
    id          uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_id     uuid           NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_id       uuid           NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    link_type   text           NOT NULL DEFAULT 'related'
        CHECK (link_type IN ('similar', 'caused_by', 'leads_to', 'related')),
    note        text,
    weight      real           NOT NULL DEFAULT 1.0,
    created_at  timestamptz    NOT NULL DEFAULT now(),
    -- 同じ (from,to,type) を重複させない
    UNIQUE (from_id, to_id, link_type)
);

CREATE INDEX IF NOT EXISTS memory_links_from_idx
    ON memory_links (from_id);
CREATE INDEX IF NOT EXISTS memory_links_to_idx
    ON memory_links (to_id);
CREATE INDEX IF NOT EXISTS memory_links_type_idx
    ON memory_links (link_type);

-- ---------------------------------------------------------------------------
-- episodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS episodes (
    id           uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    title        text          NOT NULL,
    summary      text,
    -- エピソードの重要度・感情は含まれる記憶の集約でも出せるが、
    -- 現行 memory-mcp が独立フィールドで持っているので合わせる。
    emotion      text,
    importance   smallint      CHECK (importance IS NULL OR importance BETWEEN 1 AND 5),
    start_time   timestamptz,
    end_time     timestamptz,
    participants text[]        NOT NULL DEFAULT '{}',
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS episodes_start_time_idx
    ON episodes (start_time DESC);
-- title/summary の全文検索（振り返り・エピソード検索用）
CREATE INDEX IF NOT EXISTS episodes_title_pgroonga
    ON episodes USING pgroonga (title);
CREATE INDEX IF NOT EXISTS episodes_summary_pgroonga
    ON episodes USING pgroonga (summary);

DROP TRIGGER IF EXISTS episodes_set_updated_at ON episodes;
CREATE TRIGGER episodes_set_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- episode_memories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_memories (
    episode_id  uuid       NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    memory_id   uuid       NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    order_index integer    NOT NULL DEFAULT 0,
    PRIMARY KEY (episode_id, memory_id)
);

CREATE INDEX IF NOT EXISTS episode_memories_memory_idx
    ON episode_memories (memory_id);
CREATE INDEX IF NOT EXISTS episode_memories_order_idx
    ON episode_memories (episode_id, order_index);

-- ---------------------------------------------------------------------------
-- スキーマバージョン
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_versions (
    version     text        PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    note        text
);

INSERT INTO schema_versions (version, note)
VALUES ('001_init', 'Initial schema: memories, embeddings, memory_links, episodes, episode_memories')
ON CONFLICT (version) DO NOTHING;
