"""
Linguist-Guardian — Text-to-Speech Service.

Uses Sarvam AI TTS API (Bulbul v3) for Indian languages:
  Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, English.

Returns raw audio bytes (WAV format) that can be played directly
in the browser via the Web Audio API.
"""

from __future__ import annotations

import base64

import httpx

from app.core.config import settings
from app.core.logging import logger

# Sarvam AI TTS endpoint (REST API)
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

# Language codes for Sarvam AI TTS (BCP-47)
SARVAM_LANG_CODES = {
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

# Persistent HTTP client for connection reuse
_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=15.0)
    return _http_client


async def text_to_speech(text: str, language: str = "hi") -> bytes | None:
    """
    Convert text to speech using Sarvam AI TTS API (Bulbul v3).

    Args:
        text: Text to convert (max 2500 chars).
        language: Language code ('hi', 'mr', 'ta', etc.).

    Returns:
        Raw audio bytes (WAV), or None if TTS fails.
    """
    if not settings.sarvam_enabled:
        logger.warning("Sarvam AI TTS: API key not configured")
        return None

    lang_code = SARVAM_LANG_CODES.get(language)
    if not lang_code:
        logger.warning("TTS: Unsupported language '%s'", language)
        return None

    # Truncate very long text (Bulbul v3 supports up to 2500 chars)
    if len(text) > 2500:
        text = text[:2497] + "..."

    try:
        client = _get_client()

        response = await client.post(
            SARVAM_TTS_URL,
            headers={
                "api-subscription-key": settings.sarvam_api_key,
                "Content-Type": "application/json",
            },
            json={
                "inputs": [text],
                "target_language_code": lang_code,
                "enable_preprocessing": True,
            },
        )

        if response.status_code != 200:
            logger.error(
                "Sarvam TTS failed: %d — %s",
                response.status_code,
                response.text[:300],
            )
            return None

        data = response.json()

        # Sarvam returns base64-encoded audio in the 'audios' array
        audios = data.get("audios")
        if audios and len(audios) > 0:
            audio_b64 = audios[0]
            audio_bytes = base64.b64decode(audio_b64)
            logger.info(
                "TTS [Sarvam]: lang=%s text='%s' audio=%d bytes",
                language, text[:40], len(audio_bytes),
            )
            return audio_bytes

        logger.warning("Sarvam TTS: no audio in response")
        return None

    except httpx.TimeoutException:
        logger.error("Sarvam TTS timed out (15s)")
        return None
    except Exception as exc:
        logger.error("Sarvam TTS error: %s", exc)
        return None
