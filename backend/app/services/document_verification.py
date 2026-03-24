"""
Linguist-Guardian — Document Verification Service.

Compares OCR-extracted fields against the fake user database:
  • **Document number** (PAN / Aadhaar) → Levenshtein distance
  • **Name** → Jaro-Winkler similarity
  • **DOB** → Exact string match

Thresholds:
  • Levenshtein normalised similarity ≥ 0.8 → match
  • Jaro-Winkler similarity ≥ 0.85 → match
  • DOB must match exactly
"""

from __future__ import annotations

from typing import List, Optional

import jellyfish
from Levenshtein import distance as levenshtein_distance
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.models import FakeUser
from app.schemas.schemas import (
    DocumentFieldResult,
    DocumentVerifyRequest,
    DocumentVerifyResponse,
)

# ── Similarity thresholds ─────────────────────────────────────
LEVENSHTEIN_THRESHOLD = 0.8
JARO_WINKLER_THRESHOLD = 0.85


def _normalised_levenshtein(s1: str, s2: str) -> float:
    """
    Compute normalised Levenshtein similarity (0 → 1).

    0 means completely different, 1 means identical.
    """
    if not s1 and not s2:
        return 1.0
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 1.0
    dist = levenshtein_distance(s1, s2)
    return 1.0 - (dist / max_len)


def _jaro_winkler(s1: str, s2: str) -> float:
    """
    Compute Jaro-Winkler similarity (0 → 1).
    """
    return jellyfish.jaro_winkler_similarity(s1.lower(), s2.lower())


async def verify_document(
    request: DocumentVerifyRequest,
    db: AsyncSession,
) -> DocumentVerifyResponse:
    """
    Look up the submitted document number in the fake-user table
    and compare all fields.

    Args:
        request: OCR-extracted document data.
        db: Async database session.

    Returns:
        DocumentVerifyResponse with per-field match results.
    """
    # Determine which column to search by
    if request.document_type == "pan":
        stmt = select(FakeUser).where(FakeUser.pan_number == request.extracted_number)
    else:
        stmt = select(FakeUser).where(FakeUser.aadhaar_number == request.extracted_number)

    result = await db.execute(stmt)
    user: Optional[FakeUser] = result.scalars().first()

    # If exact number match not found, try fuzzy match on all users
    if user is None:
        all_users_result = await db.execute(select(FakeUser))
        all_users: List[FakeUser] = list(all_users_result.scalars().all())

        best_score = 0.0
        best_user = None

        for u in all_users:
            ref_number = u.pan_number if request.document_type == "pan" else u.aadhaar_number
            score = _normalised_levenshtein(request.extracted_number, ref_number)
            if score > best_score:
                best_score = score
                best_user = u

        if best_user and best_score >= LEVENSHTEIN_THRESHOLD:
            user = best_user
        else:
            logger.info("Document verification: no matching user found.")
            return DocumentVerifyResponse(
                verified=False,
                user_found=False,
                results=[],
            )

    # ── Compare individual fields ─────────────────────────────
    ref_number = user.pan_number if request.document_type == "pan" else user.aadhaar_number

    results: List[DocumentFieldResult] = []

    # 1) Document number — Levenshtein
    num_score = _normalised_levenshtein(request.extracted_number, ref_number)
    results.append(DocumentFieldResult(
        field="document_number",
        submitted=request.extracted_number,
        reference=ref_number,
        method="Levenshtein",
        score=round(num_score, 4),
        match=num_score >= LEVENSHTEIN_THRESHOLD,
    ))

    # 2) Name — Jaro-Winkler
    name_score = _jaro_winkler(request.extracted_name, user.name)
    results.append(DocumentFieldResult(
        field="name",
        submitted=request.extracted_name,
        reference=user.name,
        method="Jaro-Winkler",
        score=round(name_score, 4),
        match=name_score >= JARO_WINKLER_THRESHOLD,
    ))

    # 3) DOB — Exact match
    dob_match = request.extracted_dob.strip() == user.dob.strip()
    results.append(DocumentFieldResult(
        field="dob",
        submitted=request.extracted_dob,
        reference=user.dob,
        method="Exact Match",
        score=1.0 if dob_match else 0.0,
        match=dob_match,
    ))

    # Overall verification passes only if all fields match
    all_match = all(r.match for r in results)

    logger.info(
        "Document verification: user=%s verified=%s (num=%.3f name=%.3f dob=%s)",
        user.name, all_match, num_score, name_score, dob_match,
    )

    return DocumentVerifyResponse(
        verified=all_match,
        user_found=True,
        results=results,
    )
