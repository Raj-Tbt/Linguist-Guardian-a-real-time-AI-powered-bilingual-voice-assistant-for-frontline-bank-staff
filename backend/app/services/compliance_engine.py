"""
Linguist-Guardian — Compliance Engine.

Two detection strategies run in parallel:
  1. **BM25 keyword matching** — scans text against a corpus of
     known compliance-violation phrases using Okapi BM25.
  2. **Semantic similarity** — encodes text with SentenceTransformers,
     compares against a ChromaDB collection of policy-violation
     embeddings.

If either strategy exceeds its threshold, an alert is emitted.
"""

from __future__ import annotations

import uuid
from typing import List, Dict, Optional

import numpy as np
from rank_bm25 import BM25Okapi

from app.core.logging import logger

# ── Violation corpus (keyword-based) ─────────────────────────
# Each entry is a known non-compliant phrase or statement.
VIOLATION_PHRASES: List[str] = [
    "guaranteed returns on investment",
    "no risk involved in this scheme",
    "you will definitely get approved",
    "we can bypass the verification process",
    "no need for documentation",
    "skip the KYC process",
    "hide this from the regulators",
    "unofficial fee for faster processing",
    "personal guarantee from the bank manager",
    "assured profit on this product",
    "we can manipulate your credit score",
    "don't worry about the terms and conditions",
    "just sign here without reading",
    "we can waive all charges unofficially",
    "this information stays between us",
    "I can approve this without proper verification",
    "no need to declare your existing loans",
    "we can adjust the numbers",
    "forget about the compliance requirements",
    "this is a special deal just for you off the record",
]

# Tokenised violation corpus for BM25
_TOKENIZED_CORPUS = [phrase.lower().split() for phrase in VIOLATION_PHRASES]
_BM25_INDEX = BM25Okapi(_TOKENIZED_CORPUS)

# ── Semantic violation descriptions (for vector search) ──────
SEMANTIC_VIOLATIONS: List[Dict[str, str]] = [
    {"id": "sv01", "text": "Promising guaranteed or assured returns", "severity": "critical"},
    {"id": "sv02", "text": "Suggesting to bypass or skip KYC verification", "severity": "critical"},
    {"id": "sv03", "text": "Offering to manipulate documents or data", "severity": "critical"},
    {"id": "sv04", "text": "Asking customer to sign without reading terms", "severity": "warning"},
    {"id": "sv05", "text": "Requesting unofficial or hidden fees", "severity": "critical"},
    {"id": "sv06", "text": "Promising loan approval without proper checks", "severity": "warning"},
    {"id": "sv07", "text": "Suggesting to hide information from regulators", "severity": "critical"},
    {"id": "sv08", "text": "Misrepresenting product risk level", "severity": "warning"},
    {"id": "sv09", "text": "Pressure selling without proper disclosure", "severity": "warning"},
    {"id": "sv10", "text": "Offering special treatment off the record", "severity": "warning"},
]

# ── Thresholds ────────────────────────────────────────────────
BM25_THRESHOLD = 8.0       # BM25 score above which we flag
SEMANTIC_THRESHOLD = 0.55   # cosine similarity above which we flag

# ── ChromaDB + SentenceTransformer (lazy-loaded singletons) ──
_chroma_collection = None
_sentence_model = None


def _get_sentence_model():
    """Lazy-load the SentenceTransformer model (all-MiniLM-L6-v2)."""
    global _sentence_model
    if _sentence_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("SentenceTransformer loaded for compliance engine.")
        except Exception as exc:
            logger.warning("SentenceTransformer unavailable: %s — semantic checks disabled.", exc)
    return _sentence_model


def _get_chroma_collection():
    """
    Lazy-load / create the ChromaDB collection of violation embeddings.
    """
    global _chroma_collection
    if _chroma_collection is not None:
        return _chroma_collection

    model = _get_sentence_model()
    if model is None:
        return None

    try:
        import chromadb

        client = chromadb.Client()  # in-memory

        # Delete if exists (idempotent re-init)
        try:
            client.delete_collection("compliance_violations")
        except Exception:
            pass

        collection = client.create_collection(
            name="compliance_violations",
            metadata={"hnsw:space": "cosine"},
        )

        # Embed and insert all semantic violation descriptions
        texts = [v["text"] for v in SEMANTIC_VIOLATIONS]
        embeddings = model.encode(texts).tolist()

        collection.add(
            ids=[v["id"] for v in SEMANTIC_VIOLATIONS],
            embeddings=embeddings,
            documents=texts,
            metadatas=[{"severity": v["severity"]} for v in SEMANTIC_VIOLATIONS],
        )

        _chroma_collection = collection
        logger.info("ChromaDB compliance collection initialised with %d entries.", len(texts))
        return collection

    except Exception as exc:
        logger.warning("ChromaDB init failed: %s — semantic checks disabled.", exc)
        return None


# ━━━━━━━━━━━━━━━━  BM25 Check  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def check_bm25(text: str) -> List[Dict]:
    """
    Run BM25 keyword matching against the violation corpus.

    Args:
        text: Input text to check.

    Returns:
        List of alert dicts with type, severity, description, score.
    """
    tokenized_query = text.lower().split()
    scores = _BM25_INDEX.get_scores(tokenized_query)

    alerts: List[Dict] = []
    for idx, score in enumerate(scores):
        if score >= BM25_THRESHOLD:
            alerts.append({
                "alert_type": "keyword",
                "severity": "warning",
                "description": f"Potential compliance violation detected: '{VIOLATION_PHRASES[idx]}'",
                "matched_text": VIOLATION_PHRASES[idx],
                "confidence": round(float(score / (score + BM25_THRESHOLD)), 3),
            })

    if alerts:
        logger.warning("BM25 flagged %d potential violations.", len(alerts))

    return alerts


# ━━━━━━━━━━━━━━  Semantic Check  ━━━━━━━━━━━━━━━━━━━━━━━━━━━

def check_semantic(text: str) -> List[Dict]:
    """
    Run semantic similarity check against the violation collection.

    Args:
        text: Input text to check.

    Returns:
        List of alert dicts.
    """
    model = _get_sentence_model()
    collection = _get_chroma_collection()

    if model is None or collection is None:
        return []  # gracefully degrade

    try:
        query_embedding = model.encode([text]).tolist()

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=3,
        )

        alerts: List[Dict] = []
        if results and results["distances"]:
            for i, distance in enumerate(results["distances"][0]):
                # ChromaDB cosine distance: 0 = identical, 2 = opposite
                similarity = 1.0 - (distance / 2.0)
                if similarity >= SEMANTIC_THRESHOLD:
                    doc_text = results["documents"][0][i] if results["documents"] else ""
                    severity = (
                        results["metadatas"][0][i].get("severity", "warning")
                        if results["metadatas"]
                        else "warning"
                    )
                    alerts.append({
                        "alert_type": "semantic",
                        "severity": severity,
                        "description": f"Semantic match: {doc_text}",
                        "matched_text": doc_text,
                        "confidence": round(similarity, 3),
                    })

        if alerts:
            logger.warning("Semantic check flagged %d potential violations.", len(alerts))

        return alerts

    except Exception as exc:
        logger.error("Semantic check failed: %s", exc)
        return []


# ━━━━━━━━━━━━━━  Combined Check  ━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def check_compliance(text: str) -> Dict:
    """
    Run both BM25 and semantic compliance checks.

    Args:
        text: Text to analyse.

    Returns:
        dict with keys: is_compliant (bool), alerts (list).
    """
    bm25_alerts = check_bm25(text)
    semantic_alerts = check_semantic(text)

    all_alerts = bm25_alerts + semantic_alerts

    # Deduplicate by matched_text
    seen = set()
    unique_alerts: List[Dict] = []
    for alert in all_alerts:
        key = alert.get("matched_text", "")
        if key not in seen:
            seen.add(key)
            unique_alerts.append(alert)

    is_compliant = len(unique_alerts) == 0

    logger.info(
        "Compliance check: compliant=%s alerts=%d",
        is_compliant, len(unique_alerts),
    )

    return {
        "is_compliant": is_compliant,
        "alerts": unique_alerts,
    }
