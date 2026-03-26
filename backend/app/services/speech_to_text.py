"""
Linguist-Guardian — Speech-to-Text Service.

Supports three modes (configured via WHISPER_MODE env var):
  • **mock** — returns simulated transcriptions in the customer's
    selected language. Returns ONE phrase per call (no auto-repeat).
  • **api** — sends audio to OpenAI Whisper API.
  • **sarvam** — sends audio to Sarvam AI STT (lower WER for
    Indian regional languages).

Audio is expected as raw bytes (PCM / webm from the browser).
"""

from __future__ import annotations

import random
from typing import Optional

from app.core.config import settings
from app.core.logging import logger

# ── Language-specific mock phrases ───────────────────────────
# Each language has banking-related phrases in its own script
_MOCK_BY_LANGUAGE = {
    "hi": [
        "मुझे नया बचत खाता खोलना है",
        "होम लोन पर ब्याज दर क्या है?",
        "मेरा बैलेंस बताइए",
        "मुझे फिक्स्ड डिपॉजिट में मदद चाहिए",
        "मुझे पर्सनल लोन के लिए आवेदन करना है",
        "मुझे अपने KYC दस्तावेज अपडेट करने हैं",
    ],
    "mr": [
        "मला नवीन बचत खाते उघडायचे आहे",
        "गृहकर्जावरील व्याजदर काय आहे?",
        "माझे बॅलन्स सांगा",
        "मला फिक्स्ड डिपॉझिटमध्ये मदत हवी आहे",
        "मला वैयक्तिक कर्जासाठी अर्ज करायचा आहे",
        "मला माझे KYC कागदपत्रे अपडेट करायची आहेत",
    ],
    "ta": [
        "எனக்கு புதிய சேமிப்பு கணக்கு தொடங்க வேண்டும்",
        "வீட்டுக் கடனுக்கான வட்டி விகிதம் என்ன?",
        "என் இருப்புத் தொகையைச் சொல்லுங்கள்",
        "நிலையான வைப்புத்தொகையில் எனக்கு உதவுங்கள்",
        "தனிநபர் கடனுக்கு விண்ணப்பிக்க வேண்டும்",
        "எனது KYC ஆவணங்களை புதுப்பிக்க வேண்டும்",
    ],
    "te": [
        "నాకు కొత్త పొదుపు ఖాతా తెరవాలి",
        "హోమ్ లోన్ మీద వడ్డీ రేటు ఎంత?",
        "నా బ్యాలెన్స్ చెప్పండి",
        "ఫిక్స్‌డ్ డిపాజిట్‌లో నాకు సహాయం కావాలి",
        "నాకు వ్యక్తిగత రుణం కోసం దరఖాస్తు చేయాలి",
        "నా KYC డాక్యుమెంట్లు అప్‌డేట్ చేయాలి",
    ],
    "bn": [
        "আমি একটি নতুন সঞ্চয় অ্যাকাউন্ট খুলতে চাই",
        "হোম লোনের সুদের হার কত?",
        "আমার ব্যালেন্স জানান",
        "ফিক্সড ডিপোজিটে আমাকে সাহায্য করুন",
        "আমি ব্যক্তিগত ঋণের জন্য আবেদন করতে চাই",
        "আমার KYC নথি আপডেট করতে হবে",
    ],
    "gu": [
        "મારે નવું બચત ખાતું ખોલવું છે",
        "હોમ લોન પર વ્યાજ દર શું છે?",
        "મારું બેલેન્સ બતાવો",
        "ફિક્સ્ડ ડિપોઝિટમાં મને મદદ કરો",
        "મારે પર્સનલ લોન માટે અરજી કરવી છે",
        "મારે KYC દસ્તાવેજો અપડેટ કરવા છે",
    ],
    "kn": [
        "ನನಗೆ ಹೊಸ ಉಳಿತಾಯ ಖಾತೆ ತೆರೆಯಬೇಕು",
        "ಗೃಹ ಸಾಲದ ಮೇಲೆ ಬಡ್ಡಿ ದರ ಎಷ್ಟು?",
        "ನನ್ನ ಬ್ಯಾಲೆನ್ಸ್ ಹೇಳಿ",
        "ಫಿಕ್ಸೆಡ್ ಡೆಪಾಸಿಟ್‌ನಲ್ಲಿ ನನಗೆ ಸಹಾಯ ಬೇಕು",
        "ನಾನು ವೈಯಕ್ತಿಕ ಸಾಲಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬೇಕು",
        "ನನ್ನ KYC ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಡೇಟ್ ಮಾಡಬೇಕು",
    ],
    "ml": [
        "എനിക്ക് ഒരു പുതിയ സേവിംഗ്സ് അക്കൗണ്ട് തുറക്കണം",
        "ഹോം ലോണിന്റെ പലിശ നിരക്ക് എത്രയാണ്?",
        "എന്റെ ബാലൻസ് പറയൂ",
        "ഫിക്സഡ് ഡെപ്പോസിറ്റിൽ സഹായം വേണം",
        "എനിക്ക് പേഴ്‌സണൽ ലോണിന് അപേക്ഷിക്കണം",
        "എന്റെ KYC ഡോക്യുമെന്റുകൾ അപ്‌ഡേറ്റ് ചെയ്യണം",
    ],
    "en": [
        "I want to open a new savings account",
        "What is the interest rate for home loan?",
        "I need to check my account balance",
        "Can you help me with a fixed deposit?",
        "I want to apply for a personal loan",
        "I need to update my KYC documents",
    ],
}

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
        language: Language code for the customer's selected language.

    Returns:
        dict with keys: text, language, confidence.
    """
    if settings.whisper_mode == "sarvam" and settings.sarvam_enabled:
        return await _transcribe_with_sarvam(audio_bytes, language)
    elif settings.whisper_mode == "api" and settings.openai_enabled:
        return await _transcribe_with_api(audio_bytes, language)

    return _transcribe_mock(language)


def _transcribe_mock(language: Optional[str] = None) -> dict:
    """
    Return a mock transcription in the customer's selected language.

    Returns ONE phrase per call from the language-specific pool.
    """
    global _mock_counter

    lang = language or "hi"
    pool = _MOCK_BY_LANGUAGE.get(lang, _MOCK_BY_LANGUAGE["en"])

    text = pool[_mock_counter % len(pool)]
    _mock_counter += 1

    logger.info("STT mock: '%s' (lang=%s)", text[:50], lang)

    return {
        "text": text,
        "language": lang,
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
    """Transcribe using OpenAI Whisper API."""
    try:
        import tempfile
        import openai

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

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


async def _transcribe_with_sarvam(
    audio_bytes: bytes,
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe using Sarvam AI STT API.

    Sarvam AI specialises in Indian regional languages.
    """
    try:
        import httpx
        import base64

        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        sarvam_lang_map = {
            "hi": "hi-IN", "mr": "mr-IN", "ta": "ta-IN",
            "te": "te-IN", "bn": "bn-IN", "gu": "gu-IN",
            "kn": "kn-IN", "ml": "ml-IN", "en": "en-IN",
        }
        sarvam_lang = sarvam_lang_map.get(language, "hi-IN")

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.sarvam.ai/speech-to-text",
                headers={
                    "api-subscription-key": settings.sarvam_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "input": audio_b64,
                    "language_code": sarvam_lang,
                    "model": "saarika:v2",
                },
            )
            response.raise_for_status()
            result = response.json()

        text = result.get("transcript", "")
        detected_lang = language or ("hi" if _is_hindi(text) else "en")

        logger.info("STT Sarvam: '%s' (lang=%s)", text[:50], detected_lang)

        return {
            "text": text,
            "language": detected_lang,
            "confidence": 0.93,
        }

    except Exception as exc:
        logger.error("Sarvam STT failed, falling back to mock: %s", exc)
        return _transcribe_mock(language)
