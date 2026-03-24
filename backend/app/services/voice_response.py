"""
Linguist-Guardian — Voice Response Service.

Generates text-based voice responses for the staff/customer.
TTS is mocked — returns the response text along with a placeholder
audio indicator.

In a production system this would integrate with a real TTS engine
(e.g. Google Cloud TTS, Azure TTS, or Coqui).
"""

from __future__ import annotations

from typing import Optional

from app.core.logging import logger


# ── Canned responses by intent (mock TTS) ─────────────────────
_RESPONSES_EN: dict[str, str] = {
    "loan_inquiry": "I can help you with loan information. Let me check the available options for you.",
    "account_opening": "Welcome! I'll guide you through the account opening process step by step.",
    "balance_inquiry": "Let me pull up your account details to check your current balance.",
    "fund_transfer": "I can assist you with the fund transfer. Please provide the recipient details.",
    "card_services": "I'll help you with your card request. Could you specify what you need?",
    "complaint": "I'm sorry to hear about your issue. Let me document your complaint and escalate it.",
    "greeting": "Hello! Welcome to Union Bank of India. How may I assist you today?",
    "general_query": "I'd be happy to help. Could you please provide more details about your query?",
}

_RESPONSES_HI: dict[str, str] = {
    "loan_inquiry": "मैं आपको लोन की जानकारी दे सकता हूँ। मुझे उपलब्ध विकल्प देखने दीजिए।",
    "account_opening": "स्वागत है! मैं आपको खाता खोलने की प्रक्रिया में कदम दर कदम मार्गदर्शन करूँगा।",
    "balance_inquiry": "मुझे आपके खाते का विवरण देखने दीजिए।",
    "fund_transfer": "मैं आपको फंड ट्रांसफर में सहायता कर सकता हूँ। कृपया प्राप्तकर्ता का विवरण दें।",
    "card_services": "मैं आपके कार्ड अनुरोध में मदद करूँगा। कृपया बताएं क्या चाहिए?",
    "complaint": "आपकी समस्या सुनकर दुख हुआ। मैं आपकी शिकायत दर्ज करता हूँ।",
    "greeting": "नमस्ते! यूनियन बैंक ऑफ इंडिया में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?",
    "general_query": "मुझे खुशी होगी मदद करने में। कृपया अपनी क्वेरी के बारे में और बताएं।",
}


async def generate_response(
    intent: str,
    language: str = "en",
    custom_text: Optional[str] = None,
) -> dict:
    """
    Generate a voice response for the detected intent.

    Args:
        intent: Detected intent label.
        language: Response language ('en' or 'hi').
        custom_text: Optional override text (skips canned responses).

    Returns:
        dict with keys: text, language, audio_available.
    """
    if custom_text:
        response_text = custom_text
    elif language == "hi":
        response_text = _RESPONSES_HI.get(intent, _RESPONSES_HI["general_query"])
    else:
        response_text = _RESPONSES_EN.get(intent, _RESPONSES_EN["general_query"])

    logger.info("Voice response: intent=%s lang=%s text='%s'", intent, language, response_text[:50])

    return {
        "text": response_text,
        "language": language,
        "audio_available": False,  # TTS mock — no real audio
    }
