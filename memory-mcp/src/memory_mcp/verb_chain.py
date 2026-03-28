"""VerbChainStore: 動詞チェーン記憶の保存・検索 (SQLite backend).

REMフォークから移植。graph/scoring 依存を除去した簡素版。
"""

from __future__ import annotations

import asyncio
import json
import math
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any

import numpy as np

from .chive import ChiVeEmbedding
from .vector import cosine_similarity, decode_vector, encode_vector


# ── Types ──


@dataclass(frozen=True)
class VerbStep:
    """動詞チェーンの1ステップ."""

    verb: str  # "見る"
    nouns: tuple[str, ...]  # ("猫", "庭")

    def to_dict(self) -> dict[str, Any]:
        return {"verb": self.verb, "nouns": list(self.nouns)}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VerbStep:
        return cls(verb=data["verb"], nouns=tuple(data.get("nouns", ())))

    def to_text(self) -> str:
        if self.nouns:
            return f"{self.verb}({', '.join(self.nouns)})"
        return self.verb


@dataclass(frozen=True)
class VerbChain:
    """動詞チェーン（1体験の流れ）."""

    id: str
    steps: tuple[VerbStep, ...]
    timestamp: str  # ISO 8601
    emotion: str  # happy, sad, etc.
    importance: int  # 1-5
    source: str  # "buffer" | "manual" | "auto"
    context: str  # 自由記述の補足

    def to_document(self) -> str:
        """埋め込み用テキスト."""
        parts = [step.to_text() for step in self.steps]
        doc = " → ".join(parts)
        if self.context:
            doc = f"{doc} [{self.context}]"
        return doc

    def to_metadata(self) -> dict[str, Any]:
        all_verbs = list({step.verb for step in self.steps})
        all_nouns = list({n for step in self.steps for n in step.nouns})
        return {
            "steps_json": json.dumps(
                [s.to_dict() for s in self.steps], ensure_ascii=False
            ),
            "all_verbs": ",".join(all_verbs),
            "all_nouns": ",".join(all_nouns),
            "timestamp": self.timestamp,
            "emotion": self.emotion,
            "importance": self.importance,
            "source": self.source,
            "context": self.context,
        }

    @classmethod
    def from_metadata(cls, chain_id: str, metadata: dict[str, Any]) -> VerbChain:
        steps_raw = json.loads(metadata.get("steps_json", "[]"))
        steps = tuple(VerbStep.from_dict(s) for s in steps_raw)
        return cls(
            id=chain_id,
            steps=steps,
            timestamp=metadata.get("timestamp", ""),
            emotion=metadata.get("emotion", "neutral"),
            importance=int(metadata.get("importance", 3)),
            source=metadata.get("source", "manual"),
            context=metadata.get("context", ""),
        )


# ── Scoring (inline, no external dependency) ──


def _time_decay(timestamp: str, now: datetime, half_life_days: float = 30.0) -> float:
    """時間減衰。新しいほど1.0に近い。"""
    try:
        memory_time = datetime.fromisoformat(timestamp)
        if memory_time.tzinfo is None:
            memory_time = memory_time.replace(tzinfo=timezone.utc)
    except ValueError:
        return 1.0
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - memory_time).total_seconds() / 86400)
    return math.pow(2, -age_days / half_life_days)


def _importance_boost(importance: int) -> float:
    return (max(1, min(5, importance)) - 1) / 10  # 1→0.0, 5→0.4


# ── Store ──


class VerbChainStore:
    """SQLite-backed verb chain storage."""

    def __init__(self, db: sqlite3.Connection, chive: ChiVeEmbedding):
        self._db = db
        self._chive = chive
        self._verb_to_chain_ids: dict[str, set[str]] = defaultdict(set)
        self._noun_to_chain_ids: dict[str, set[str]] = defaultdict(set)
        self._bigram_to_chain_ids: dict[str, set[str]] = defaultdict(set)

    async def initialize(self) -> None:
        """起動時に転置インデックスをDBから構築."""
        import logging
        import time
        lg = logging.getLogger(__name__)
        t0 = time.monotonic()

        rows = await asyncio.to_thread(
            lambda: self._db.execute(
                "SELECT id, all_verbs, all_nouns, steps_json FROM verb_chains"
            ).fetchall()
        )

        for row in rows:
            chain_id = row[0]
            verbs_str = row[1] or ""
            nouns_str = row[2] or ""
            steps_json = row[3] or "[]"

            for v in verbs_str.split(","):
                v = v.strip()
                if v:
                    self._verb_to_chain_ids[v].add(chain_id)
            for n in nouns_str.split(","):
                n = n.strip()
                if n:
                    self._noun_to_chain_ids[n].add(chain_id)
            self._index_bigrams_from_json(chain_id, steps_json)

        lg.info("VerbChainStore: built index for %d chains in %.2fs", len(rows), time.monotonic() - t0)

    def _index_chain(self, chain: VerbChain) -> None:
        for step in chain.steps:
            self._verb_to_chain_ids[step.verb].add(chain.id)
            for noun in step.nouns:
                self._noun_to_chain_ids[noun].add(chain.id)
        for i in range(len(chain.steps) - 1):
            bigram_key = f"{chain.steps[i].verb}→{chain.steps[i + 1].verb}"
            self._bigram_to_chain_ids[bigram_key].add(chain.id)

    def _index_bigrams_from_json(self, chain_id: str, steps_json: str) -> None:
        try:
            steps_raw = json.loads(steps_json)
            verbs = [s.get("verb", "") for s in steps_raw if s.get("verb")]
            for i in range(len(verbs) - 1):
                self._bigram_to_chain_ids[f"{verbs[i]}→{verbs[i + 1]}"].add(chain_id)
        except (json.JSONDecodeError, TypeError):
            pass

    async def save(self, chain: VerbChain) -> VerbChain:
        """チェーンをSQLiteに保存."""
        meta = chain.to_metadata()

        verb_texts = [step.verb for step in chain.steps]
        noun_texts = list({n for step in chain.steps for n in step.nouns})
        flow_vec, delta_vec = self._chive.encode_chain(verb_texts, noun_texts)
        concat_vec = np.concatenate([flow_vec, delta_vec])

        def _insert() -> None:
            self._db.execute(
                """INSERT OR IGNORE INTO verb_chains
                   (id, document, steps_json, all_verbs, all_nouns,
                    timestamp, emotion, importance, source, context)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    chain.id,
                    chain.to_document(),
                    meta["steps_json"],
                    meta["all_verbs"],
                    meta["all_nouns"],
                    meta["timestamp"],
                    meta["emotion"],
                    meta["importance"],
                    meta["source"],
                    meta["context"],
                ),
            )
            self._db.execute(
                "INSERT OR IGNORE INTO verb_chain_embeddings (chain_id, vector, flow_vector, delta_vector) VALUES (?,?,?,?)",
                (chain.id, encode_vector(concat_vec), encode_vector(flow_vec), encode_vector(delta_vec)),
            )
            self._db.commit()

        await asyncio.to_thread(_insert)
        self._index_chain(chain)
        return chain

    async def search(
        self,
        query: str,
        n_results: int = 5,
        flow_weight: float = 0.6,
    ) -> list[tuple[VerbChain, float]]:
        """2軸コサイン類似度でチェーンを検索.

        flow_weight: flow軸の重み (0.0-1.0)。残りがdelta軸。
        スコアは低いほど良い（距離ベース）。
        """

        def _search_db() -> list[tuple[VerbChain, float]]:
            rows = self._db.execute(
                """SELECT vc.id, vc.document, vc.steps_json, vc.all_verbs, vc.all_nouns,
                          vc.timestamp, vc.emotion, vc.importance, vc.source, vc.context,
                          vce.flow_vector, vce.delta_vector
                   FROM verb_chains vc
                   JOIN verb_chain_embeddings vce ON vc.id = vce.chain_id
                   WHERE vce.flow_vector IS NOT NULL"""
            ).fetchall()

            if not rows:
                return []

            q_flow, q_delta = self._chive.encode_text(query)
            now = datetime.now(timezone.utc)

            scored: list[tuple[VerbChain, float]] = []
            for row in rows:
                metadata = {
                    "steps_json": row[2],
                    "all_verbs": row[3],
                    "all_nouns": row[4],
                    "timestamp": row[5],
                    "emotion": row[6],
                    "importance": row[7],
                    "source": row[8],
                    "context": row[9],
                }
                chain = VerbChain.from_metadata(row[0], metadata)

                m_flow = decode_vector(bytes(row[10]))
                m_delta = decode_vector(bytes(row[11]))

                flow_sim = float(cosine_similarity(q_flow, m_flow.reshape(1, -1))[0])
                delta_sim = float(cosine_similarity(q_delta, m_delta.reshape(1, -1))[0])
                sim = flow_weight * flow_sim + (1.0 - flow_weight) * delta_sim

                # Lower is better (distance)
                semantic_distance = 1.0 - sim
                decay = _time_decay(chain.timestamp, now)
                decay_penalty = (1.0 - decay) * 0.3
                imp_boost = _importance_boost(chain.importance) * 0.2

                final_score = semantic_distance + decay_penalty - imp_boost
                scored.append((chain, max(0.0, final_score)))

            scored.sort(key=lambda x: x[1])
            return scored[:n_results]

        return await asyncio.to_thread(_search_db)

    async def get_chain(self, chain_id: str) -> VerbChain | None:
        """IDでチェーンを取得."""
        chains = await self._get_chains_by_ids([chain_id])
        return chains[0] if chains else None

    async def get_all(self) -> list[VerbChain]:
        """全チェーンを取得."""
        def _fetch_all() -> list[VerbChain]:
            rows = self._db.execute(
                """SELECT id, document, steps_json, all_verbs, all_nouns,
                          timestamp, emotion, importance, source, context
                   FROM verb_chains"""
            ).fetchall()
            chains: list[VerbChain] = []
            for row in rows:
                metadata = {
                    "steps_json": row[2],
                    "all_verbs": row[3],
                    "all_nouns": row[4],
                    "timestamp": row[5],
                    "emotion": row[6],
                    "importance": row[7],
                    "source": row[8],
                    "context": row[9],
                }
                chains.append(VerbChain.from_metadata(row[0], metadata))
            return chains
        return await asyncio.to_thread(_fetch_all)

    async def _get_chains_by_ids(self, chain_ids: list[str]) -> list[VerbChain]:
        if not chain_ids:
            return []

        def _fetch() -> list[VerbChain]:
            placeholders = ",".join("?" for _ in chain_ids)
            rows = self._db.execute(
                f"""SELECT id, document, steps_json, all_verbs, all_nouns,
                           timestamp, emotion, importance, source, context
                    FROM verb_chains WHERE id IN ({placeholders})""",
                chain_ids,
            ).fetchall()
            chains: list[VerbChain] = []
            for row in rows:
                metadata = {
                    "steps_json": row[2],
                    "all_verbs": row[3],
                    "all_nouns": row[4],
                    "timestamp": row[5],
                    "emotion": row[6],
                    "importance": row[7],
                    "source": row[8],
                    "context": row[9],
                }
                chains.append(VerbChain.from_metadata(row[0], metadata))
            return chains
        return await asyncio.to_thread(_fetch)


def crystallize_buffer(
    entries: list[dict[str, Any]],
    emotion: str = "neutral",
    importance: int = 3,
    min_verbs: int = 2,
    merge_threshold: float = 0.2,
) -> list[VerbChain]:
    """sensory_bufferエントリ群からVerbChainを生成."""
    if not entries:
        return []

    steps_with_nouns: list[tuple[list[VerbStep], set[str]]] = []
    for entry in entries:
        verbs = entry.get("v", [])
        nouns = entry.get("w", [])
        if not verbs:
            continue
        entry_steps = [VerbStep(verb=v, nouns=tuple(nouns)) for v in verbs]
        steps_with_nouns.append((entry_steps, set(nouns)))

    if not steps_with_nouns:
        return []

    # Merge entries with overlapping nouns
    groups: list[list[tuple[list[VerbStep], set[str]]]] = []
    current_group: list[tuple[list[VerbStep], set[str]]] = [steps_with_nouns[0]]

    for i in range(1, len(steps_with_nouns)):
        prev_nouns = current_group[-1][1]
        curr_nouns = steps_with_nouns[i][1]
        shared = prev_nouns & curr_nouns
        smaller = min(len(prev_nouns), len(curr_nouns))
        if smaller > 0 and len(shared) / smaller >= merge_threshold:
            current_group.append(steps_with_nouns[i])
        else:
            groups.append(current_group)
            current_group = [steps_with_nouns[i]]
    groups.append(current_group)

    chains: list[VerbChain] = []
    timestamp = datetime.now(timezone.utc).isoformat()

    for group in groups:
        all_steps: list[VerbStep] = []
        for entry_steps, _ in group:
            all_steps.extend(entry_steps)

        if len(all_steps) < min_verbs:
            continue

        chain = VerbChain(
            id=str(uuid.uuid4()),
            steps=tuple(all_steps),
            timestamp=timestamp,
            emotion=emotion,
            importance=importance,
            source="buffer",
            context="",
        )
        chains.append(chain)

    return chains
