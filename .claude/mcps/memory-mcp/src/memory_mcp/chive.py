"""chiVe word2vec wrapper for 2-vector (flow + delta) embedding."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from gensim.models import KeyedVectors

logger = logging.getLogger(__name__)

_sudachi_tokenizer = None

_VERB_STOPLIST = {"為る", "有る", "居る", "成る", "出来る"}
_NOUN_STOPLIST = {"こと", "もの", "ため", "よう", "それ", "これ", "ここ", "そこ"}

# 汎用動詞: flow計算でバイグラムの前側としてスキップ
_GENERIC_VERBS = {
    "為る", "有る", "居る", "成る", "出来る",
    "言う", "呉れる", "遣る", "来る", "見る", "行く", "貰う", "置く",
}

DEFAULT_CHIVE_PATH = os.path.expanduser(
    "~/workspace/models/chive-1.2-mc90_gensim/chive-1.2-mc90.kv"
)


def _get_sudachi_tokenizer():
    global _sudachi_tokenizer
    if _sudachi_tokenizer is None:
        from sudachipy import Dictionary
        _sudachi_tokenizer = Dictionary().create()
    return _sudachi_tokenizer


def _normalize_word(word: str) -> str:
    """sudachipy normalized_form で語を正規化."""
    try:
        tokenizer = _get_sudachi_tokenizer()
        tokens = tokenizer.tokenize(word)
        if tokens:
            return tokens[0].normalized_form()
    except Exception:
        pass
    return word


class ChiVeEmbedding:
    """chiVe (word2vec) wrapper for 2-vector computation.

    Provides:
    - get_word_vector(word): 動詞・名詞両対応
    - compute_flow_vector(verbs): バイグラム中点平均 + L2正規化
    - compute_delta_vector(verbs, nouns): N_avg - V_avg + L2正規化
    - encode_text(text): テキストから動詞・名詞抽出 → (flow_vec, delta_vec)
    - encode_chain(verbs, nouns): 構造化データから → (flow_vec, delta_vec)
    """

    def __init__(self, model_path: str | None = None):
        self._model_path = model_path or os.environ.get(
            "CHIVE_MODEL_PATH", DEFAULT_CHIVE_PATH
        )
        self._wv: KeyedVectors | None = None

    def _load(self) -> None:
        if self._wv is not None:
            return
        from gensim.models import KeyedVectors
        logger.info("Loading chiVe model from %s ...", self._model_path)
        self._wv = KeyedVectors.load(self._model_path)
        logger.info("chiVe loaded: %d words, %d dims", len(self._wv), self._wv.vector_size)

    def _ensure_loaded(self) -> KeyedVectors:
        if self._wv is None:
            self._load()
        assert self._wv is not None
        return self._wv

    @property
    def vector_size(self) -> int:
        wv = self._ensure_loaded()
        return wv.vector_size

    # ── Single word lookup ──

    def get_word_vector(self, word: str) -> np.ndarray | None:
        """Get vector for a word.

        Strategy:
        1. Try normalized_form
        2. Try raw word
        3. SplitMode.A decomposition, average subword vectors
        """
        wv = self._ensure_loaded()

        normalized = _normalize_word(word)
        if normalized in wv:
            return wv[normalized]

        if word != normalized and word in wv:
            return wv[word]

        # SplitMode.A fallback
        try:
            from sudachipy import SplitMode
            tokenizer = _get_sudachi_tokenizer()
            sub_tokens = tokenizer.tokenize(word, SplitMode.A)
            if len(sub_tokens) > 1:
                sub_vecs = []
                for t in sub_tokens:
                    sf = t.normalized_form()
                    if sf in wv:
                        sub_vecs.append(wv[sf])
                    elif t.surface() in wv:
                        sub_vecs.append(wv[t.surface()])
                if sub_vecs:
                    return np.mean(sub_vecs, axis=0)
        except Exception:
            pass

        return None

    # ── Flow vector (verb bigram midpoint average) ──

    def compute_flow_vector(self, verbs: list[str]) -> np.ndarray:
        """Compute flow vector from verb list.

        - Collects chiVe vectors for each verb
        - Skips bigrams where a generic verb is the left element
        - Adds bookend midpoint (first + last verb)
        - L2-normalizes the result
        """
        vecs = []
        is_generic = []
        for v in verbs:
            vec = self.get_word_vector(v)
            if vec is not None:
                vecs.append(vec)
                is_generic.append(_normalize_word(v) in _GENERIC_VERBS)

        if not vecs:
            return np.zeros(self.vector_size, dtype=np.float32)

        vecs_arr = np.array(vecs)
        if len(vecs_arr) >= 2:
            bigrams = []
            for i in range(len(vecs_arr) - 1):
                if is_generic[i]:
                    continue
                bigrams.append((vecs_arr[i] + vecs_arr[i + 1]) / 2.0)

            if not bigrams:
                bigrams = [
                    (vecs_arr[i] + vecs_arr[i + 1]) / 2.0
                    for i in range(len(vecs_arr) - 1)
                ]

            bookend = (vecs_arr[0] + vecs_arr[-1]) / 2.0
            all_midpoints = bigrams + [bookend] * len(bigrams)
            flow_vec = np.mean(all_midpoints, axis=0)
        else:
            flow_vec = vecs_arr[0].copy()

        norm = np.linalg.norm(flow_vec)
        if norm > 0:
            flow_vec = flow_vec / norm
        return flow_vec.astype(np.float32)

    # ── Delta vector (noun context - verb context) ──

    def compute_delta_vector(self, verbs: list[str], nouns: list[str]) -> np.ndarray:
        """Compute delta vector: N_avg - V_avg, L2-normalized."""
        noun_vecs = []
        for n in nouns:
            vec = self.get_word_vector(n)
            if vec is not None:
                noun_vecs.append(vec)

        verb_vecs = []
        for v in verbs:
            vec = self.get_word_vector(v)
            if vec is not None:
                verb_vecs.append(vec)

        if not noun_vecs:
            return np.zeros(self.vector_size, dtype=np.float32)

        n_avg = np.mean(noun_vecs, axis=0)

        if verb_vecs:
            v_avg = np.mean(verb_vecs, axis=0)
            delta = n_avg - v_avg
        else:
            delta = n_avg

        norm = np.linalg.norm(delta)
        if norm > 0:
            delta = delta / norm
        return delta.astype(np.float32)

    # ── High-level ──

    def encode_chain(self, verbs: list[str], nouns: list[str]) -> tuple[np.ndarray, np.ndarray]:
        """Compute (flow_vector, delta_vector) from structured verb/noun lists."""
        flow = self.compute_flow_vector(verbs)
        delta = self.compute_delta_vector(verbs, nouns)
        return flow, delta

    def encode_text(self, text: str) -> tuple[np.ndarray, np.ndarray]:
        """Extract verbs/nouns from text via sudachipy, then compute 2-vectors."""
        verbs, nouns = self.extract_words(text)
        return self.encode_chain(verbs, nouns)

    def extract_words(self, text: str) -> tuple[list[str], list[str]]:
        """Extract verbs and nouns from Japanese text using sudachipy."""
        try:
            tokenizer = _get_sudachi_tokenizer()
            tokens = tokenizer.tokenize(text)
        except Exception:
            return [], []

        verbs: list[str] = []
        nouns: list[str] = []

        for t in tokens:
            pos = t.part_of_speech()
            lemma = t.normalized_form()

            if pos[0] == "動詞":
                if lemma not in _VERB_STOPLIST:
                    verbs.append(lemma)
            elif pos[0] == "名詞":
                if len(pos) > 1 and pos[1] in ("普通名詞", "固有名詞"):
                    if lemma not in _NOUN_STOPLIST:
                        nouns.append(lemma)

        return verbs, nouns
