"""Sleep-like replay and consolidation routines.

Phase 4: Union-Find合成 + バウンダリー層 + 交差検出（フラグ依存）.
REMフォークから移植、graph依存除去。
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from math import ceil
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from .store import MemoryStore
    from .types import Memory

# ── Bias Update Constants ──────────────────────
BIAS_ACCUMULATION_RATE = 0.01
BIAS_MAX_CAP = 0.15
BIAS_DECAY_FACTOR = 0.95
BIAS_PRUNE_THRESHOLD = 0.001
BIAS_APPLY_COEFFICIENT = 0.05


@dataclass
class ConsolidationStats:
    """Summary statistics for replay execution."""

    replay_events: int
    coactivation_updates: int
    link_updates: int
    refreshed_memories: int
    freshness_decayed: bool = False
    composites_created: int = 0
    composites_skipped: int = 0
    # Feature-flag dependent
    boundary_layers_computed: int = 0
    overlaps_detected: int = 0
    intersections_detected: int = 0
    orphans_rescued: int = 0
    # Phase 5: Disclosure
    importance_promoted: int = 0
    importance_demoted: int = 0
    disclosures_detected: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "replay_events": self.replay_events,
            "coactivation_updates": self.coactivation_updates,
            "link_updates": self.link_updates,
            "refreshed_memories": self.refreshed_memories,
            "freshness_decayed": self.freshness_decayed,
            "composites_created": self.composites_created,
            "composites_skipped": self.composites_skipped,
            "boundary_layers_computed": self.boundary_layers_computed,
            "overlaps_detected": self.overlaps_detected,
            "intersections_detected": self.intersections_detected,
            "orphans_rescued": self.orphans_rescued,
            "importance_promoted": self.importance_promoted,
            "importance_demoted": self.importance_demoted,
            "disclosures_detected": self.disclosures_detected,
        }


class ConsolidationEngine:
    """Replay memories and update association strengths."""

    async def run(
        self,
        store: "MemoryStore",
        window_hours: int = 24,
        max_replay_events: int = 200,
        link_update_strength: float = 0.2,
    ) -> ConsolidationStats:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, window_hours))
        recent = await store.list_recent(limit=max(max_replay_events * 2, 50))
        recent = [m for m in recent if self._is_after(m, cutoff)]

        if len(recent) < 2:
            return ConsolidationStats(0, 0, 0, len(recent))

        replay_events = 0
        coactivation_updates = 0
        link_updates = 0
        refreshed_ids: set[str] = set()

        for idx in range(len(recent) - 1):
            if replay_events >= max_replay_events:
                break

            left = recent[idx]
            right = recent[idx + 1]

            delta = max(0.05, min(1.0, link_update_strength))
            await store.bump_coactivation(left.id, right.id, delta=delta)
            coactivation_updates += 2

            left_error = max(0.0, left.prediction_error * 0.9)
            right_error = max(0.0, right.prediction_error * 0.9)
            await store.record_activation(left.id, prediction_error=left_error)
            await store.record_activation(right.id, prediction_error=right_error)
            refreshed_ids.add(left.id)
            refreshed_ids.add(right.id)

            if await store.maybe_add_related_link(left.id, right.id, threshold=0.6):
                link_updates += 1

            replay_events += 1

        return ConsolidationStats(
            replay_events=replay_events,
            coactivation_updates=coactivation_updates,
            link_updates=link_updates,
            refreshed_memories=len(refreshed_ids),
        )

    # ── Phase 2: Union-Find 合成 ──

    async def synthesize_composites(
        self,
        store: "MemoryStore",
        similarity_threshold: float = 0.75,
        min_group_size: int = 2,
        max_group_size: int = 8,
    ) -> dict[str, int]:
        """Union-Find で類似記憶をグループ化し、合成記憶を生成。"""
        mem_vecs = await store.fetch_memories_with_vectors(min_freshness=0.1)
        if len(mem_vecs) < min_group_size:
            return {"composites_created": 0, "composites_skipped": 0}

        memories = [mv[0] for mv in mem_vecs]
        vectors = np.array([mv[1] for mv in mem_vecs])

        # コサイン類似度行列
        norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-10
        normalized = vectors / norms
        sim_matrix = normalized @ normalized.T

        # Union-Find
        n = len(memories)
        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x: int, y: int) -> None:
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        for i in range(n):
            for j in range(i + 1, n):
                if sim_matrix[i, j] >= similarity_threshold:
                    union(i, j)

        groups: dict[int, list[int]] = {}
        for i in range(n):
            root = find(i)
            groups.setdefault(root, []).append(i)

        groups = {k: v for k, v in groups.items() if len(v) >= min_group_size}

        # max_group_size 超過時はスコア上位に絞る
        for root, indices in list(groups.items()):
            if len(indices) > max_group_size:
                scores = [(sum(sim_matrix[idx, j] for j in indices if j != idx), idx) for idx in indices]
                scores.sort(reverse=True)
                groups[root] = [idx for _, idx in scores[:max_group_size]]

        existing = await store.get_existing_composite_members()
        composites_created = 0
        composites_skipped = 0

        for indices in groups.values():
            member_ids = frozenset(memories[i].id for i in indices)
            if member_ids in existing:
                composites_skipped += 1
                continue

            # importance 加重平均ベクトル
            weights = np.array([float(memories[i].importance) for i in indices])
            member_vectors = np.array([vectors[i] for i in indices])
            weighted_sum = (member_vectors.T @ weights).T
            norm = np.linalg.norm(weighted_sum) + 1e-10
            composite_vector = weighted_sum / norm

            # メタ情報集約
            emotions = [memories[i].emotion for i in indices]
            composite_emotion = Counter(emotions).most_common(1)[0][0]
            importances = [memories[i].importance for i in indices]
            composite_importance = min(5, ceil(sum(importances) / len(importances)))
            freshnesses = [memories[i].freshness for i in indices]
            composite_freshness = max(freshnesses)
            categories = [memories[i].category for i in indices]
            composite_category = Counter(categories).most_common(1)[0][0]

            # PCA 主成分軸
            pca_result = self._compute_principal_axis(member_vectors)
            axis_vector = pca_result[0] if pca_result else None
            explained_var = pca_result[1] if pca_result else None

            await store.save_composite(
                member_ids=list(member_ids),
                vector=composite_vector,
                emotion=composite_emotion,
                importance=composite_importance,
                freshness=composite_freshness,
                category=composite_category,
                axis_vector=axis_vector,
                explained_variance_ratio=explained_var,
                level=1,
            )
            composites_created += 1

        return {
            "composites_created": composites_created,
            "composites_skipped": composites_skipped,
        }

    # ── Phase 3: バウンダリー層（フラグ依存） ──

    async def compute_boundary_layers(
        self,
        store: "MemoryStore",
        n_layers: int = 3,
        noise_scale: float = 0.1,
    ) -> dict[str, int]:
        """外縁検出 + ノイズレイヤー生成。"""
        composite_ids = await store.fetch_all_composite_ids()
        if not composite_ids:
            return {"composites_processed": 0, "total_layers": 0}

        await store.clear_boundary_layers()
        all_axes = await store.fetch_all_composite_axes()

        # テンプレート取得（verb_chain flow vectors）
        templates: list[tuple[np.ndarray, float]] = []
        try:
            raw_templates = await store.fetch_verb_chain_templates()
            for _chain_id, vec, _verbs, _nouns in raw_templates:
                templates.append((vec, 0.1))  # fixed strength (no graph)
        except Exception:
            pass

        composites_processed = 0
        total_layers = 0

        for cid in composite_ids:
            members = await store.fetch_composite_with_vectors(cid)
            if len(members) < 2:
                continue

            centroid = await store.fetch_composite_centroid(cid)
            if centroid is None:
                continue

            member_ids = [m[0] for m in members]
            member_vecs = np.array([m[1] for m in members])
            axis_vec = all_axes.get(cid)

            # Layer 0: ノイズなし
            layer0 = self._classify_edge_core(member_vecs, centroid, axis_vec)
            all_layers: list[tuple[str, int, int]] = []
            for i, mid in enumerate(member_ids):
                all_layers.append((mid, 0, layer0[i]))

            # Layer 1..n_layers: ノイズ適用
            for layer_idx in range(1, n_layers + 1):
                noised_vecs = self._apply_noise(member_vecs, templates, noise_scale, layer_idx)
                noised_centroid = noised_vecs.mean(axis=0)
                nc_norm = np.linalg.norm(noised_centroid) + 1e-10
                noised_centroid = noised_centroid / nc_norm

                layer_classes = self._classify_edge_core(noised_vecs, noised_centroid, axis_vec)
                for i, mid in enumerate(member_ids):
                    all_layers.append((mid, layer_idx, layer_classes[i]))

            await store.save_boundary_layers(cid, all_layers)
            composites_processed += 1
            total_layers += 1 + n_layers

        return {
            "composites_processed": composites_processed,
            "total_layers": total_layers,
        }

    # ── Phase 3.5: 重なり検出（フラグ依存） ──

    async def detect_overlap(
        self,
        store: "MemoryStore",
        overlap_threshold: float = 0.5,
    ) -> dict[str, int]:
        """composite 間の重なりを検出し、二重所属メンバーを追加。"""
        composite_ids = await store.fetch_all_composite_ids()
        if len(composite_ids) < 2:
            return {"overlap_pairs": 0, "dual_members_added": 0}

        centroids: dict[str, np.ndarray] = {}
        member_vecs_map: dict[str, list[tuple[str, np.ndarray]]] = {}
        existing_members = await store.fetch_all_composite_member_sets()

        for cid in composite_ids:
            centroid = await store.fetch_composite_centroid(cid)
            if centroid is None:
                continue
            centroids[cid] = centroid
            members = await store.fetch_composite_with_vectors(cid)
            member_vecs_map[cid] = members

        cids = list(centroids.keys())
        overlap_pairs = 0
        inserts: list[tuple[str, str, float]] = []

        for i in range(len(cids)):
            for j in range(i + 1, len(cids)):
                ca, cb = cids[i], cids[j]
                sim = float(np.dot(centroids[ca], centroids[cb]) / (
                    np.linalg.norm(centroids[ca]) * np.linalg.norm(centroids[cb]) + 1e-10
                ))
                if sim <= overlap_threshold:
                    continue
                overlap_pairs += 1

                for mid, mvec in member_vecs_map.get(ca, []):
                    if mid in existing_members.get(cb, set()):
                        continue
                    msim = float(np.dot(mvec, centroids[cb]) / (
                        np.linalg.norm(mvec) * np.linalg.norm(centroids[cb]) + 1e-10
                    ))
                    if msim > overlap_threshold:
                        inserts.append((cb, mid, 0.5))

                for mid, mvec in member_vecs_map.get(cb, []):
                    if mid in existing_members.get(ca, set()):
                        continue
                    msim = float(np.dot(mvec, centroids[ca]) / (
                        np.linalg.norm(mvec) * np.linalg.norm(centroids[ca]) + 1e-10
                    ))
                    if msim > overlap_threshold:
                        inserts.append((ca, mid, 0.5))

        if inserts:
            db = store._ensure_connected()
            db.executemany(
                "INSERT OR IGNORE INTO composite_members (composite_id, member_id, contribution_weight) VALUES (?,?,?)",
                inserts,
            )
            db.commit()

        return {"overlap_pairs": overlap_pairs, "dual_members_added": len(inserts)}

    # ── Phase 3.6: 孤立記憶救出（フラグ依存） ──

    async def rescue_orphans(
        self,
        store: "MemoryStore",
        rescue_threshold: float = 0.4,
    ) -> dict[str, int]:
        """どのcompositeにも属さない孤立記憶を最寄りcompositeに吸収。"""
        orphans = await store.fetch_orphan_memories(min_freshness=0.1)
        if not orphans:
            return {"orphans_found": 0, "orphans_rescued": 0}

        composite_ids = await store.fetch_all_composite_ids()
        if not composite_ids:
            return {"orphans_found": len(orphans), "orphans_rescued": 0}

        centroids: dict[str, np.ndarray] = {}
        for cid in composite_ids:
            centroid = await store.fetch_composite_centroid(cid)
            if centroid is not None:
                centroids[cid] = centroid

        if not centroids:
            return {"orphans_found": len(orphans), "orphans_rescued": 0}

        db = store._ensure_connected()
        orphans_rescued = 0

        for mem, vec in orphans:
            best_cid = None
            best_sim = -1.0
            for cid, centroid in centroids.items():
                sim = float(np.dot(vec, centroid) / (
                    np.linalg.norm(vec) * np.linalg.norm(centroid) + 1e-10
                ))
                if sim > best_sim:
                    best_sim = sim
                    best_cid = cid

            if best_cid is not None and best_sim >= rescue_threshold:
                db.execute(
                    "INSERT OR IGNORE INTO composite_members (composite_id, member_id, contribution_weight) VALUES (?,?,?)",
                    (best_cid, mem.id, 0.3),
                )
                orphans_rescued += 1

        if orphans_rescued > 0:
            db.commit()

        return {"orphans_found": len(orphans), "orphans_rescued": orphans_rescued}

    # ── Phase 4: 交差検出（フラグ依存） ──

    async def detect_intersections(
        self,
        store: "MemoryStore",
        parallel_threshold: float = 0.8,
        transversal_threshold: float = 0.3,
    ) -> dict[str, int]:
        """全compositeペアの主成分軸を比較し、交差を検出。"""
        axes = await store.fetch_all_composite_axes()
        if len(axes) < 2:
            return {"parallel_found": 0, "transversal_found": 0, "intersection_nodes": 0}

        member_sets = await store.fetch_all_composite_member_sets()
        composite_ids = list(axes.keys())
        intersections: list[tuple[str, str, str, float, list[str]]] = []
        intersection_node_ids: set[str] = set()

        for i in range(len(composite_ids)):
            for j in range(i + 1, len(composite_ids)):
                cid_a, cid_b = composite_ids[i], composite_ids[j]
                cos_angle = float(np.abs(np.dot(axes[cid_a], axes[cid_b])))
                shared = member_sets.get(cid_a, set()) & member_sets.get(cid_b, set())

                if cos_angle >= parallel_threshold:
                    intersections.append((cid_a, cid_b, "parallel", cos_angle, list(shared)))
                    intersection_node_ids.update(shared)
                elif cos_angle <= transversal_threshold and shared:
                    intersections.append((cid_a, cid_b, "transversal", cos_angle, list(shared)))
                    intersection_node_ids.update(shared)

        await store.save_intersections(intersections)

        return {
            "parallel_found": sum(1 for x in intersections if x[2] == "parallel"),
            "transversal_found": sum(1 for x in intersections if x[2] == "transversal"),
            "intersection_nodes": len(intersection_node_ids),
        }

    # ── Phase 5: Importance Drift ──

    async def drift_importance(
        self,
        store: "MemoryStore",
    ) -> dict[str, int]:
        """activation/access パターンに基づく importance の自然変動。"""
        all_memories = await store.list_recent(limit=10000)
        promoted = 0
        demoted = 0

        for mem in all_memories:
            new_imp = mem.importance

            # 昇格ルール
            if mem.activation_count >= 15 and mem.importance < 5:
                new_imp = mem.importance + 1
            elif mem.activation_count >= 5 and mem.importance < 4:
                new_imp = mem.importance + 1
            elif mem.access_count >= 10 and mem.importance < 4:
                new_imp = mem.importance + 1

            # 降格ルール（importance 5 は保護）
            if (
                new_imp == mem.importance  # 昇格していない場合のみ
                and mem.freshness < 0.05
                and mem.access_count == 0
                and mem.activation_count == 0
                and mem.importance > 1
                and mem.importance < 5  # 5は降格保護
            ):
                new_imp = mem.importance - 1

            # 最大 ±1 の変動
            if new_imp != mem.importance:
                await store.update_memory_fields(mem.id, importance=new_imp)
                if new_imp > mem.importance:
                    promoted += 1
                else:
                    demoted += 1

        return {"promoted": promoted, "demoted": demoted}

    # ── Phase 5: Disclosure Detection ──

    async def detect_disclosures(
        self,
        store: "MemoryStore",
        window_hours: int = 24,
    ) -> dict[str, int]:
        """低 importance 記憶の急な重要性上昇を検出。"""
        all_memories = await store.list_recent(limit=10000)
        low_imp = [m for m in all_memories if m.importance <= 2]

        disclosures: list[str] = []
        promoted_count = 0

        for mem in low_imp:
            is_disclosure = False

            # 条件1: リンク数 >= 4（ハブ化）
            link_count = await store.get_link_count(mem.id)
            if link_count >= 4:
                is_disclosure = True

            # 条件2: activation_count >= 3（急な想起頻度）
            if not is_disclosure and mem.activation_count >= 3:
                is_disclosure = True

            # 条件3: 3つ以上の composite に所属（交差点）
            if not is_disclosure:
                comp_count = await store.get_composite_membership_count(mem.id)
                if comp_count >= 3:
                    is_disclosure = True

            if is_disclosure:
                disclosures.append(mem.id)
                new_imp = min(4, mem.importance + 1)  # 最大4（5はマスター専用）
                if new_imp != mem.importance:
                    await store.update_memory_fields(mem.id, importance=new_imp)
                    promoted_count += 1

                # [disclosure] タグ追加
                tags = list(mem.tags)
                if "disclosure" not in tags:
                    tags.append("disclosure")
                    await store.update_memory_fields(mem.id, tags=",".join(tags))

        return {
            "disclosures_detected": len(disclosures),
            "promoted_count": promoted_count,
        }

    # ── Daily Digest Generation ──

    async def generate_daily_digests(self, store: "MemoryStore") -> int:
        """全記憶を日付でグループ化し、daily_digest テーブルに蓄積。"""
        all_memories = await store.list_recent(limit=10000)
        if not all_memories:
            return 0

        # 日付でグループ化
        by_date: dict[str, list["Memory"]] = {}
        for mem in all_memories:
            try:
                date_str = mem.timestamp[:10]  # 'YYYY-MM-DD'
                if len(date_str) == 10 and date_str[4] == "-":
                    by_date.setdefault(date_str, []).append(mem)
            except (IndexError, ValueError):
                continue

        days_updated = 0
        for date, memories in by_date.items():
            # 各記憶の content を先頭40文字に切り詰め
            snippets = []
            for m in memories:
                snippet = m.content[:40].replace("\n", " ")
                if len(m.content) > 40:
                    snippet += "…"
                snippets.append(snippet)
            summary = "; ".join(snippets)

            categories = ",".join(sorted(set(m.category for m in memories)))
            emotions = ",".join(sorted(set(m.emotion for m in memories)))
            avg_imp = sum(m.importance for m in memories) / len(memories)
            mem_ids = ",".join(m.id for m in memories)

            await store.upsert_daily_digest(
                date=date,
                memory_count=len(memories),
                summary=summary,
                categories=categories,
                emotions=emotions,
                avg_importance=round(avg_imp, 2),
                memory_ids=mem_ids,
            )
            days_updated += 1

        return days_updated

    # ── Internal helpers ──

    def _compute_principal_axis(
        self, member_vecs: np.ndarray
    ) -> tuple[np.ndarray, float] | None:
        """PCA: 第一主成分と寄与率を返す。"""
        if member_vecs.shape[0] < 2:
            return None
        centroid = member_vecs.mean(axis=0)
        centered = member_vecs - centroid
        try:
            _, s, vt = np.linalg.svd(centered, full_matrices=False)
        except np.linalg.LinAlgError:
            return None
        axis = vt[0]
        norm = np.linalg.norm(axis)
        if norm < 1e-10:
            return None
        axis = axis / norm
        total_var = float(np.sum(s ** 2))
        if total_var < 1e-10:
            return None
        explained = float(s[0] ** 2) / total_var
        return axis.astype(np.float32), explained

    def _classify_edge_core(
        self,
        member_vecs: np.ndarray,
        centroid: np.ndarray,
        axis_vector: np.ndarray | None = None,
    ) -> list[int]:
        """メンバーを重心からの距離で edge(1) / core(0) に分類。"""
        c_norm = centroid / (np.linalg.norm(centroid) + 1e-10)
        m_norms = member_vecs / (np.linalg.norm(member_vecs, axis=1, keepdims=True) + 1e-10)

        if axis_vector is None:
            similarities = m_norms @ c_norm
            distances = 1.0 - similarities
        else:
            a_norm = axis_vector / (np.linalg.norm(axis_vector) + 1e-10)
            diffs = m_norms - c_norm
            axial_proj = np.outer(diffs @ a_norm, a_norm)
            perp = diffs - axial_proj
            axial_dist = np.linalg.norm(axial_proj, axis=1)
            perp_dist = np.linalg.norm(perp, axis=1)
            distances = 0.3 * axial_dist + 1.0 * perp_dist

        d_mean = float(np.mean(distances))
        return [1 if float(d) > d_mean else 0 for d in distances]

    def _apply_noise(
        self,
        member_vecs: np.ndarray,
        templates: list[tuple[np.ndarray, float]],
        noise_scale: float,
        seed: int,
    ) -> np.ndarray:
        """テンプレートベースのノイズを適用。"""
        rng = np.random.default_rng(seed)
        n_members = member_vecs.shape[0]
        dim = member_vecs.shape[1]

        if not templates:
            noise = rng.normal(0, noise_scale, size=(n_members, dim)).astype(np.float32)
            noised = member_vecs + noise
            norms = np.linalg.norm(noised, axis=1, keepdims=True) + 1e-10
            return noised / norms

        noised = member_vecs.copy()
        m_norms = member_vecs / (np.linalg.norm(member_vecs, axis=1, keepdims=True) + 1e-10)

        for t_vec, strength in templates:
            alpha = rng.normal(0, 1)
            if len(t_vec) < dim:
                t_padded = np.zeros(dim, dtype=t_vec.dtype)
                t_padded[:len(t_vec)] = t_vec
                t_vec = t_padded
            elif len(t_vec) > dim:
                t_vec = t_vec[:dim]
            t_norm = t_vec / (np.linalg.norm(t_vec) + 1e-10)
            alignments = m_norms @ t_norm
            for i in range(n_members):
                noised[i] += strength * alpha * float(alignments[i]) * t_norm * noise_scale

        norms = np.linalg.norm(noised, axis=1, keepdims=True) + 1e-10
        return noised / norms

    def _is_after(self, memory: "Memory", cutoff: datetime) -> bool:
        try:
            timestamp = datetime.fromisoformat(memory.timestamp)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
        except ValueError:
            return False
        if cutoff.tzinfo is None:
            cutoff = cutoff.replace(tzinfo=timezone.utc)
        return timestamp >= cutoff
