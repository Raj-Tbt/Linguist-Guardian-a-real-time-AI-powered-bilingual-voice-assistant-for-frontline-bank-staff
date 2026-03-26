"""
Linguist-Guardian — Sarvam AI Translation Service.

Integrates with the Sarvam AI Translate API to provide high-quality
translation between English and 8 Indian languages:
  Marathi, Hindi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam.

Falls back to a mock "[Translated]" prefix when the API key is not
configured or the API call fails.
"""

from __future__ import annotations

import re
from typing import Optional

import httpx

from app.core.config import settings
from app.core.logging import logger


# ── Language code mapping ────────────────────────────────────
SARVAM_LANG_CODES: dict[str, str] = {
    "hi": "hi-IN",
    "mr": "mr-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "en": "en-IN",
}

LANG_NAMES: dict[str, str] = {
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "en": "English",
}

# Unicode ranges for Indian scripts
_SCRIPT_RANGES: dict[str, str] = {
    "hi": r"[\u0900-\u097F]",   # Devanagari (Hindi/Marathi share script)
    "mr": r"[\u0900-\u097F]",   # Devanagari
    "ta": r"[\u0B80-\u0BFF]",   # Tamil
    "te": r"[\u0C00-\u0C7F]",   # Telugu
    "bn": r"[\u0980-\u09FF]",   # Bengali
    "gu": r"[\u0A80-\u0AFF]",   # Gujarati
    "kn": r"[\u0C80-\u0CFF]",   # Kannada
    "ml": r"[\u0D00-\u0D7F]",   # Malayalam
}

SARVAM_API_URL = "https://api.sarvam.ai/translate"


def detect_language(text: str) -> str:
    """
    Detect language from script used in the text.

    Checks for Indian scripts first (Tamil, Telugu, Bengali, Gujarati,
    Kannada, Malayalam, then Devanagari). Falls back to 'en'.

    Note: Hindi and Marathi share Devanagari — we default to 'hi'
    for Devanagari text unless context says otherwise.
    """
    # Check non-Devanagari scripts first (unique to their language)
    for lang in ["ta", "te", "bn", "gu", "kn", "ml"]:
        if re.search(_SCRIPT_RANGES[lang], text):
            return lang

    # Devanagari → default to Hindi
    if re.search(_SCRIPT_RANGES["hi"], text):
        return "hi"

    return "en"


async def translate(
    text: str,
    source_lang: str,
    target_lang: str,
) -> str:
    """
    Translate text using the Sarvam AI Translate API.

    Args:
        text: Text to translate.
        source_lang: Source language code (e.g. 'hi', 'mr', 'en').
        target_lang: Target language code.

    Returns:
        Translated text string.
    """
    if source_lang == target_lang:
        return text

    # Validate language codes
    src_code = SARVAM_LANG_CODES.get(source_lang)
    tgt_code = SARVAM_LANG_CODES.get(target_lang)

    if not src_code or not tgt_code:
        logger.warning(
            "Unsupported language pair: %s → %s, returning original",
            source_lang, target_lang,
        )
        return f"[{LANG_NAMES.get(target_lang, target_lang)} translation] {text}"

    if not settings.sarvam_enabled:
        logger.info("Sarvam API key not set — using mock translation")
        return _mock_translate(text, source_lang, target_lang)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                SARVAM_API_URL,
                headers={
                    "api-subscription-key": settings.sarvam_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "input": text,
                    "source_language_code": src_code,
                    "target_language_code": tgt_code,
                    "mode": "formal",
                    "model": "mayura:v1",
                    "enable_preprocessing": True,
                },
            )
            response.raise_for_status()
            result = response.json()
            translated = result.get("translated_text", text)
            logger.info(
                "Sarvam translate: %s→%s '%s' → '%s'",
                source_lang, target_lang, text[:40], translated[:40],
            )
            return translated

    except Exception as exc:
        logger.error("Sarvam API call failed: %s — falling back to mock", exc)
        return _mock_translate(text, source_lang, target_lang)


def _mock_translate(text: str, source_lang: str, target_lang: str) -> str:
    """Return a mock translation with a language prefix marker."""
    tgt_name = LANG_NAMES.get(target_lang, target_lang)
    return f"[Translated to {tgt_name}] {text}"
