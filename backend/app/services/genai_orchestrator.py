"""
Linguist-Guardian — GenAI Orchestrator Service.

Single service that handles:
  • Intent detection from customer text
  • Bilingual translation (Hindi ↔ English)
  • Returns structured JSON: { intent, translated_text, confidence }

Uses OpenAI GPT-4o when API key is available, otherwise falls back
to a deterministic mock that maps keywords to intents and uses a
small translation dictionary.
"""

from __future__ import annotations

import re
from typing import Optional

from app.core.config import settings
from app.core.logging import logger


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

# ── Small Hindi ↔ English dictionary (mock translation) ──────
_MOCK_TRANSLATIONS_HI_EN: dict[str, str] = {
    "नमस्ते": "Hello",
    "मुझे लोन चाहिए": "I want a loan",
    "मेरा बैलेंस बताइए": "Please tell me my balance",
    "नया खाता खोलना है": "I want to open a new account",
    "ब्याज दर क्या है": "What is the interest rate",
    "पैसे भेजने हैं": "I need to send money",
    "मेरा कार्ड ब्लॉक कर दीजिए": "Please block my card",
    "शिकायत दर्ज करनी है": "I want to file a complaint",
    "मुझे लोन के बारे में जानकारी चाहिए": "I want information about a loan",
    "खाता खोलने की प्रक्रिया बताइए": "Please explain the account opening process",
    "कितना ब्याज लगेगा": "How much interest will be charged",
}

_MOCK_TRANSLATIONS_EN_HI: dict[str, str] = {v: k for k, v in _MOCK_TRANSLATIONS_HI_EN.items()}


def _detect_language(text: str) -> str:
    """
    Simple heuristic: if text contains Devanagari characters → 'hi', else 'en'.
    """
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"
    return "en"


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


def _mock_translate(text: str, source_lang: str) -> str:
    """
    Return a mock translation. If an exact match exists in the
    dictionary, use it; otherwise apply a simple prefix marker.
    """
    if source_lang == "hi":
        if text in _MOCK_TRANSLATIONS_HI_EN:
            return _MOCK_TRANSLATIONS_HI_EN[text]
        return f"[Translated from Hindi] {text}"
    else:
        if text in _MOCK_TRANSLATIONS_EN_HI:
            return _MOCK_TRANSLATIONS_EN_HI[text]
        return f"[हिंदी अनुवाद] {text}"


# ━━━━━━━━━━━━━━━━  Public API  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def process_text(
    text: str,
    target_language: Optional[str] = None,
) -> dict:
    """
    Main orchestrator entry-point.

    1. Detect source language
    2. Detect intent
    3. Translate to target language
    4. Return structured JSON

    Args:
        text: Input text (customer or staff utterance).
        target_language: Target language code ('en' or 'hi').
                         If None, auto-flips from detected source.

    Returns:
        dict with keys: intent, translated_text, confidence,
        source_language, target_language
    """
    source_lang = _detect_language(text)
    if target_language is None:
        target_language = "en" if source_lang == "hi" else "hi"

    if settings.openai_enabled:
        return await _process_with_openai(text, source_lang, target_language)

    # ── Mock mode ─────────────────────────────────────────────
    intent, confidence = _mock_detect_intent(text)
    translated = _mock_translate(text, source_lang)

    logger.info(
        "GenAI mock — intent=%s conf=%.2f src=%s tgt=%s",
        intent, confidence, source_lang, target_language,
    )

    return {
        "intent": intent,
        "translated_text": translated,
        "confidence": confidence,
        "source_language": source_lang,
        "target_language": target_language,
    }


async def _process_with_openai(
    text: str,
    source_lang: str,
    target_lang: str,
) -> dict:
    """
    Use OpenAI GPT-4o for intent detection + translation.

    Sends a single prompt that asks the model to return both
    the intent and translation in a JSON object.
    """
    try:
        import openai

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        src_name = "Hindi" if source_lang == "hi" else "English"
        tgt_name = "Hindi" if target_lang == "hi" else "English"

        system_prompt = (
            "You are a banking assistant AI. Given customer text, "
            "return a JSON object with exactly two keys:\n"
            '  "intent" — one of: loan_inquiry, account_opening, '
            "balance_inquiry, fund_transfer, card_services, complaint, "
            "greeting, general_query\n"
            f'  "translated_text" — the text translated from {src_name} to {tgt_name}\n'
            "Return ONLY valid JSON, nothing else."
        )

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=300,
        )

        import json
        result = json.loads(response.choices[0].message.content)

        logger.info("GenAI OpenAI — intent=%s", result.get("intent"))

        return {
            "intent": result.get("intent", "general_query"),
            "translated_text": result.get("translated_text", text),
            "confidence": 0.95,
            "source_language": source_lang,
            "target_language": target_lang,
        }

    except Exception as exc:
        logger.error("OpenAI call failed, falling back to mock: %s", exc)
        intent, confidence = _mock_detect_intent(text)
        translated = _mock_translate(text, source_lang)
        return {
            "intent": intent,
            "translated_text": translated,
            "confidence": confidence,
            "source_language": source_lang,
            "target_language": target_lang,
        }
