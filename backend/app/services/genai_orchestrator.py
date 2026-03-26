"""
Linguist-Guardian — GenAI Orchestrator Service.

Single service that handles:
  • Intent detection from customer text
  • Multilingual translation (8 Indian languages ↔ English)
  • Returns structured JSON: { intent, translated_text, confidence }

Uses Sarvam AI for translation when available, OpenAI GPT-4o for
intent detection when configured, otherwise falls back to mock mode.
"""

from __future__ import annotations

import re
from typing import Optional

from app.core.config import settings
from app.core.logging import logger
from app.services import sarvam_translate


# ── Intent keyword map (used for mock mode) ──────────────────
_INTENT_KEYWORDS: dict[str, list[str]] = {
    "loan_inquiry": [
        "loan", "emi", "interest rate", "borrow", "credit",
        "ऋण", "कर्ज", "ब्याज", "लोन",
    ],
    "account_opening": [
        "open account", "new account", "savings account", "current account",
        "खाता खोलना", "नया खाता", "बचत खाता",
    ],
    "balance_inquiry": [
        "balance", "how much", "check balance", "account balance",
        "बैलेंस", "शेष राशि",
    ],
    "fund_transfer": [
        "transfer", "send money", "neft", "rtgs", "imps",
        "पैसे भेजना", "ट्रांसफर",
    ],
    "card_services": [
        "debit card", "credit card", "atm card", "block card",
        "डेबिट कार्ड", "क्रेडिट कार्ड",
    ],
    "complaint": [
        "complaint", "problem", "issue", "not working",
        "शिकायत", "समस्या",
    ],
    "greeting": [
        "hello", "hi", "good morning", "namaste", "namaskar",
        "नमस्ते", "नमस्कार",
    ],
}


def _mock_detect_intent(text: str) -> tuple[str, float]:
    """
    Keyword-based intent detection for mock mode.

    Returns (intent_label, confidence) tuple.
    """
    text_lower = text.lower()
    best_intent = "general_query"
    best_score = 0.0

    for intent, keywords in _INTENT_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw in text_lower)
        if matches > best_score:
            best_score = matches
            best_intent = intent

    # Normalise confidence to 0-1 range
    confidence = min(best_score / 3.0, 1.0) if best_score > 0 else 0.3
    return best_intent, confidence


# ━━━━━━━━━━━━━━━━  Public API  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def process_text(
    text: str,
    target_language: Optional[str] = None,
) -> dict:
    """
    Main orchestrator entry-point.

    1. Detect source language (supports 8 Indian scripts)
    2. Detect intent
    3. Translate to target language using Sarvam AI
    4. Return structured JSON

    Args:
        text: Input text (customer or staff utterance).
        target_language: Target language code (e.g. 'en', 'hi', 'mr').
                         If None, auto-flips to 'en' for Indian langs
                         or 'hi' for English.

    Returns:
        dict with keys: intent, translated_text, confidence,
        source_language, target_language
    """
    source_lang = sarvam_translate.detect_language(text)
    if target_language is None:
        target_language = "en" if source_lang != "en" else "hi"

    # ── Intent detection ──────────────────────────────────────
    if settings.openai_enabled:
        intent, confidence = await _detect_intent_openai(text)
    else:
        intent, confidence = _mock_detect_intent(text)

    # ── Translation via Sarvam AI ─────────────────────────────
    translated = await sarvam_translate.translate(text, source_lang, target_language)

    logger.info(
        "GenAI — intent=%s conf=%.2f src=%s tgt=%s sarvam=%s",
        intent, confidence, source_lang, target_language,
        "yes" if settings.sarvam_enabled else "mock",
    )

    return {
        "intent": intent,
        "translated_text": translated,
        "confidence": confidence,
        "source_language": source_lang,
        "target_language": target_language,
    }


async def _detect_intent_openai(text: str) -> tuple[str, float]:
    """
    Use OpenAI GPT-4o for intent detection only.
    Translation is handled by Sarvam AI separately.
    """
    try:
        import json
        import openai

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        system_prompt = (
            "You are a banking assistant AI. Given customer text in any language, "
            "return a JSON object with exactly one key:\n"
            '  "intent" — one of: loan_inquiry, account_opening, '
            "balance_inquiry, fund_transfer, card_services, complaint, "
            "greeting, general_query\n"
            "Return ONLY valid JSON, nothing else."
        )

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=100,
        )

        result = json.loads(response.choices[0].message.content)
        intent = result.get("intent", "general_query")
        logger.info("Intent (OpenAI): %s", intent)
        return intent, 0.95

    except Exception as exc:
        logger.error("OpenAI intent detection failed: %s", exc)
        return _mock_detect_intent(text)
