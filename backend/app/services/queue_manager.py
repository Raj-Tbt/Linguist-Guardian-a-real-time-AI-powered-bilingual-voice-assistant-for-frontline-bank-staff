"""
Linguist-Guardian — Urgency Queue Manager (Algo #1).

Maintains a per-branch priority queue (min-heap) of active
customers ranked by an urgency score.

Formula:
  Urgency(c) = α*(1 - stress) + β*wait_norm + γ*complexity + δ*doc_pending

  Where:
    α = 0.35  (stress component — lower stress → higher urgency number → lower priority)
    β = 0.30  (normalised wait time)
    γ = 0.20  (intent complexity)
    δ = 0.15  (document verification pending flag)

  The score is INVERTED for the min-heap: lower scores are served first.
  So we negate the raw urgency before pushing to heapq.

Intent complexity mapping:
  loan_inquiry       → 3
  account_opening    → 2
  card_services      → 2
  fund_transfer      → 1.5
  complaint          → 1.5
  balance_inquiry    → 1
  general_query      → 1
  greeting           → 0.5
"""

from __future__ import annotations

import heapq
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.core.logging import logger


# ── Weights ───────────────────────────────────────────────────
ALPHA = 0.35   # stress component
BETA = 0.30    # wait time component
GAMMA = 0.20   # complexity component
DELTA = 0.15   # document-pending component

# Normaliser for wait time (seconds) — 30 minutes = 1.0
WAIT_MAX_SECONDS = 1800.0

# ── Complexity map ────────────────────────────────────────────
INTENT_COMPLEXITY: Dict[str, float] = {
    "loan_inquiry": 3.0,
    "account_opening": 2.0,
    "card_services": 2.0,
    "fund_transfer": 1.5,
    "complaint": 1.5,
    "balance_inquiry": 1.0,
    "general_query": 1.0,
    "greeting": 0.5,
}

MAX_COMPLEXITY = 3.0  # for normalisation


# ── Customer entry ────────────────────────────────────────────

@dataclass(order=True)
class QueueEntry:
    """A single customer in the priority queue."""
    priority: float                           # negated urgency (for min-heap)
    session_id: str = field(compare=False)
    customer_name: str = field(compare=False, default="Customer")
    intent: str = field(compare=False, default="general_query")
    stress_score: float = field(compare=False, default=0.0)
    doc_pending: bool = field(compare=False, default=False)
    enqueue_time: float = field(compare=False, default_factory=time.time)


# ── Queue singleton ──────────────────────────────────────────
_queue: List[QueueEntry] = []
_entries: Dict[str, QueueEntry] = {}  # session_id → entry


def compute_urgency(
    stress_score: float,
    wait_seconds: float,
    intent: str,
    doc_pending: bool,
) -> float:
    """
    Compute the raw urgency score (0.0–1.0, higher = more urgent).

    Args:
        stress_score: Customer stress (0.0–1.0 from sentiment_analyzer).
        wait_seconds: How long the customer has been waiting.
        intent: Detected intent label.
        doc_pending: Whether document verification is pending.

    Returns:
        float urgency score.
    """
    stress_component = ALPHA * (1.0 - stress_score)
    wait_norm = min(wait_seconds / WAIT_MAX_SECONDS, 1.0)
    wait_component = BETA * wait_norm
    complexity = INTENT_COMPLEXITY.get(intent, 1.0) / MAX_COMPLEXITY
    complexity_component = GAMMA * complexity
    doc_component = DELTA * (1.0 if doc_pending else 0.0)

    urgency = stress_component + wait_component + complexity_component + doc_component
    return round(urgency, 4)


def enqueue(
    session_id: str,
    customer_name: str = "Customer",
    intent: str = "general_query",
    stress_score: float = 0.0,
    doc_pending: bool = False,
) -> float:
    """
    Add or update a customer in the priority queue.

    Returns the computed urgency score.
    """
    now = time.time()
    enqueue_time = _entries[session_id].enqueue_time if session_id in _entries else now
    wait_seconds = now - enqueue_time

    urgency = compute_urgency(stress_score, wait_seconds, intent, doc_pending)

    entry = QueueEntry(
        priority=-urgency,  # negate for min-heap (most urgent first)
        session_id=session_id,
        customer_name=customer_name,
        intent=intent,
        stress_score=stress_score,
        doc_pending=doc_pending,
        enqueue_time=enqueue_time,
    )

    # Remove old entry if exists
    if session_id in _entries:
        _entries.pop(session_id)
        # Rebuild heap without the old entry
        _queue[:] = [e for e in _queue if e.session_id != session_id]
        heapq.heapify(_queue)

    heapq.heappush(_queue, entry)
    _entries[session_id] = entry

    logger.info(
        "Queue: session=%s urgency=%.4f stress=%.2f intent=%s",
        session_id[:8], urgency, stress_score, intent,
    )

    return urgency


def dequeue() -> Optional[QueueEntry]:
    """Remove and return the highest-priority customer."""
    while _queue:
        entry = heapq.heappop(_queue)
        if entry.session_id in _entries:
            _entries.pop(entry.session_id)
            return entry
    return None


def remove(session_id: str) -> None:
    """Remove a customer from the queue (session ended)."""
    if session_id in _entries:
        _entries.pop(session_id)
        _queue[:] = [e for e in _queue if e.session_id != session_id]
        heapq.heapify(_queue)
        logger.info("Queue: removed session=%s", session_id[:8])


def get_queue_state() -> List[dict]:
    """
    Return the current queue as a sorted list of dicts
    (most urgent first).
    """
    # Sort by priority (most negative = most urgent)
    sorted_entries = sorted(
        [e for e in _queue if e.session_id in _entries],
        key=lambda e: e.priority,
    )

    now = time.time()
    return [
        {
            "session_id": e.session_id,
            "customer_name": e.customer_name,
            "intent": e.intent,
            "stress_score": e.stress_score,
            "urgency": round(-e.priority, 4),
            "wait_minutes": round((now - e.enqueue_time) / 60, 1),
            "doc_pending": e.doc_pending,
        }
        for e in sorted_entries
    ]


def get_queue_size() -> int:
    """Return the number of customers in the queue."""
    return len(_entries)
