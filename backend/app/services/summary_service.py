"""
Linguist-Guardian — Bilingual Summary Service (TextRank).

Generates extractive summaries from conversation logs using
the TextRank algorithm:
  1. Encode each message with SentenceTransformers
  2. Build a cosine-similarity matrix
  3. Run iterative PageRank to rank sentences
  4. Select top-k sentences as the summary
  5. Provide both English and Hindi summaries

Falls back to simple truncation when SentenceTransformers
is unavailable.
"""

from __future__ import annotations

import re
from typing import List, Optional

import numpy as np

from app.core.logging import logger


def _cosine_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Compute pairwise cosine similarity matrix for a set of embeddings.

    Args:
        embeddings: (n, d) array of sentence embeddings.

    Returns:
        (n, n) cosine similarity matrix.
    """
    # Normalise each row to unit length
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)  # avoid division by zero
    normalised = embeddings / norms
    return normalised @ normalised.T


def _pagerank(
    similarity_matrix: np.ndarray,
    damping: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-6,
) -> np.ndarray:
    """
    Compute PageRank scores from a similarity matrix.

    Args:
        similarity_matrix: (n, n) non-negative similarity matrix.
        damping: damping factor (standard 0.85).
        max_iter: maximum iterations.
        tol: convergence tolerance.

    Returns:
        (n,) array of PageRank scores.
    """
    n = similarity_matrix.shape[0]
    if n == 0:
        return np.array([])

    # Row-normalise the similarity matrix to form a transition matrix
    row_sums = similarity_matrix.sum(axis=1, keepdims=True)
    row_sums = np.where(row_sums == 0, 1, row_sums)
    transition = similarity_matrix / row_sums

    # Initialise scores uniformly
    scores = np.ones(n) / n

    for _ in range(max_iter):
        new_scores = (1 - damping) / n + damping * (transition.T @ scores)
        if np.abs(new_scores - scores).sum() < tol:
            break
        scores = new_scores

    return scores


def _is_hindi(text: str) -> bool:
    """Check if text contains Devanagari script."""
    return bool(re.search(r"[\u0900-\u097F]", text))


def _get_model():
    """Lazy-load SentenceTransformer model."""
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer("all-MiniLM-L6-v2")
    except Exception as exc:
        logger.warning("SentenceTransformer unavailable for summary: %s", exc)
        return None


async def generate_summary(
    messages: List[str],
    top_k: int = 5,
) -> dict:
    """
    Generate a bilingual extractive summary using TextRank.

    Args:
        messages: List of raw message texts from the conversation.
        top_k: Number of top sentences to include.

    Returns:
        dict with keys: summary_en, summary_hi.
    """
    if not messages:
        return {"summary_en": "No messages to summarise.", "summary_hi": "सारांश के लिए कोई संदेश नहीं।"}

    # Separate English and Hindi messages
    en_messages = [m for m in messages if not _is_hindi(m)]
    hi_messages = [m for m in messages if _is_hindi(m)]

    model = _get_model()

    summary_en = _textrank_summary(en_messages, model, top_k) if en_messages else "No English messages."
    summary_hi = _textrank_summary(hi_messages, model, top_k) if hi_messages else "कोई हिंदी संदेश नहीं।"

    logger.info(
        "Summary generated: en=%d chars, hi=%d chars",
        len(summary_en), len(summary_hi),
    )

    return {
        "summary_en": summary_en,
        "summary_hi": summary_hi,
    }


def _textrank_summary(
    sentences: List[str],
    model,
    top_k: int,
) -> str:
    """
    Apply TextRank to a list of sentences and return top-k.

    Falls back to simple concatenation if model is unavailable
    or for very short inputs.
    """
    if not sentences:
        return ""

    # For very short conversations, just return everything
    if len(sentences) <= top_k:
        return " ".join(sentences)

    if model is None:
        # Fallback: return first top_k sentences
        return " ".join(sentences[:top_k])

    try:
        # 1. Encode all sentences
        embeddings = model.encode(sentences)

        # 2. Build cosine similarity matrix
        sim_matrix = _cosine_similarity_matrix(embeddings)

        # Zero out self-similarity (diagonal)
        np.fill_diagonal(sim_matrix, 0)

        # 3. Run PageRank
        scores = _pagerank(sim_matrix)

        # 4. Select top-k sentences (preserving original order)
        top_indices = np.argsort(scores)[-top_k:]
        top_indices = sorted(top_indices)  # maintain chronological order

        summary_sentences = [sentences[i] for i in top_indices]
        return " ".join(summary_sentences)

    except Exception as exc:
        logger.error("TextRank failed, using fallback: %s", exc)
        return " ".join(sentences[:top_k])
