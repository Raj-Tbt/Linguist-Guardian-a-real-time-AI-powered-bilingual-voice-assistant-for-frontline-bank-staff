"""
Linguist-Guardian — Speech-to-Text Service.

Supports two modes (configured via WHISPER_MODE env var):
  • **mock** — returns simulated transcriptions from a rotating
    set of sample banking phrases. Useful for development without
    a microphone or GPU.
  • **api** — sends audio to OpenAI Whisper API for real
    transcription.

Audio is expected as raw bytes (PCM / webm chunks from the browser).
"""

from __future__ import annotations

import random
from typing import Optional

from app.core.config import settings
from app.core.logging import logger

# ── Mock transcription pool ──────────────────────────────────
# Realistic customer utterances in English and Hindi
_MOCK_TRANSCRIPTIONS = [
    "I want to open a new savings account",
    "मुझे नया बचत खाता खोलना है",
    "What is the interest rate for home loan?",
    "होम लोन पर ब्याज दर क्या है?",
    "I need to check my account balance",
    "मेरा बैलेंस बताइए",
    "Can you help me with a fixed deposit?",
    "मुझे फिक्स्ड डिपॉजिट में मदद चाहिए",
    "I want to apply for a personal loan",
    "मुझे पर्सनल लोन के लिए आवेदन करना है",
    "Please transfer money to this account",
    "इस खाते में पैसे भेजिए",
    "I need to update my KYC documents",
    "मुझे अपने KYC दस्तावेज अपडेट करने हैं",
    "What is the process for loan closure?",
    "लोन बंद करने की प्रक्रिया क्या है?",
]

# Counter for deterministic mock rotation
_mock_counter = 0


async def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe audio to text.

    Args:
        audio_bytes: Raw audio data (PCM or webm).
        language: Optional language hint ('en', 'hi').

    Returns:
        dict with keys: text, language, confidence.
    """
    if settings.whisper_mode == "api" and settings.openai_enabled:
        return await _transcribe_with_api(audio_bytes, language)

    return _transcribe_mock(language)


def _transcribe_mock(language: Optional[str] = None) -> dict:
    """
    Return a mock transcription from the pool.

    Rotates through the pool deterministically so every call
    produces a different result.
    """
    global _mock_counter

    # Filter by language if specified
    if language == "hi":
        pool = [t for t in _MOCK_TRANSCRIPTIONS if _is_hindi(t)]
    elif language == "en":
        pool = [t for t in _MOCK_TRANSCRIPTIONS if not _is_hindi(t)]
    else:
        pool = _MOCK_TRANSCRIPTIONS

    if not pool:
        pool = _MOCK_TRANSCRIPTIONS

    text = pool[_mock_counter % len(pool)]
    _mock_counter += 1
    detected_lang = "hi" if _is_hindi(text) else "en"

    logger.info("STT mock: '%s' (lang=%s)", text[:50], detected_lang)

    return {
        "text": text,
        "language": detected_lang,
        "confidence": 0.92,
    }


def _is_hindi(text: str) -> bool:
    """Check if text contains Devanagari characters."""
    import re
    return bool(re.search(r"[\u0900-\u097F]", text))


async def _transcribe_with_api(
    audio_bytes: bytes,
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe using OpenAI Whisper API.

    Writes audio to a temp file, sends to the API, returns result.
    """
    try:
        import tempfile
        import openai

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        # Write audio bytes to a temporary file
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        with open(tmp_path, "rb") as audio_file:
            response = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=language,
            )

        text = response.text
        detected_lang = language or ("hi" if _is_hindi(text) else "en")

        logger.info("STT API: '%s' (lang=%s)", text[:50], detected_lang)

        return {
            "text": text,
            "language": detected_lang,
            "confidence": 0.95,
        }

    except Exception as exc:
        logger.error("Whisper API failed, falling back to mock: %s", exc)
        return _transcribe_mock(language)
