"""
Linguist-Guardian — Context-Aware Compliance Engine.

Monitors staff communication for RBI compliance violations using:
  1. Configurable keyword database (compliance_keywords.json)
  2. Context-aware negation detection — suppresses alerts when trigger
     phrases appear inside a negation context (e.g. "NOT guaranteed returns")
  3. Risk-based classification: high / medium / low

Negation Detection:
  Scans a window of up to 5 words BEFORE each trigger phrase for
  negation tokens like "not", "no", "never", "don't", "doesn't",
  "won't", "isn't", "aren't", "cannot", "can't", "without", "neither".
  If a negation is found, the alert is suppressed.

Configuration:
  All keywords are stored in compliance_keywords.json.
  Update that file to add/remove phrases — no code changes needed.
"""

from __future__ import annotations

import json
import os
import re
from typing import List, Dict

from app.core.logging import logger

# ── Load keyword database ─────────────────────────────────────
_KEYWORDS_PATH = os.path.join(os.path.dirname(__file__), "compliance_keywords.json")


def _load_keywords() -> dict:
    """Load the compliance keywords JSON file."""
    try:
        with open(_KEYWORDS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.error("Failed to load compliance keywords: %s", exc)
        return {"keywords": [], "categories": {}}


_CONFIG = _load_keywords()
_KEYWORDS: List[dict] = _CONFIG.get("keywords", [])
_CATEGORIES: Dict[str, str] = _CONFIG.get("categories", {})

# ── Negation tokens ───────────────────────────────────────────
NEGATION_TOKENS = {
    "not", "no", "never", "neither", "nor",
    "don't", "dont", "doesn't", "doesnt",
    "didn't", "didnt", "won't", "wont",
    "wouldn't", "wouldnt", "shouldn't", "shouldnt",
    "can't", "cant", "cannot", "couldn't", "couldnt",
    "isn't", "isnt", "aren't", "arent",
    "wasn't", "wasnt", "weren't", "werent",
    "hasn't", "hasnt", "haven't", "havent",
    "without", "deny", "denies", "denied",
    "refuse", "refuses", "refused",
    "prevent", "prevents", "prohibited",
}

# How many words before the trigger phrase to scan for negation
NEGATION_WINDOW = 5

# ── Risk level mapping ────────────────────────────────────────
RISK_LABELS = {
    "high": "🔴 High Risk",
    "medium": "🟡 Medium Risk",
    "low": "🟢 Low Risk",
}

RISK_SEVERITY = {
    "high": "critical",
    "medium": "warning",
    "low": "info",
}


def _is_negated(text_lower: str, phrase: str) -> bool:
    """
    Check if a trigger phrase is preceded by a negation word
    within a window of NEGATION_WINDOW words.

    Example:
      "this is NOT a guaranteed return"
        → phrase = "guaranteed return"
        → words before: ["this", "is", "not", "a"]
        → "not" found in negation tokens → True (negated)

      "this gives guaranteed returns"
        → words before: ["this", "gives"]
        → no negation token → False (not negated)
    """
    # Find where the phrase starts in the text
    phrase_pos = text_lower.find(phrase)
    if phrase_pos < 0:
        return False

    # Get the text before the phrase
    prefix = text_lower[:phrase_pos].strip()
    if not prefix:
        return False

    # Tokenize and look at the last N words
    words = re.findall(r"[a-z']+", prefix)
    window = words[-NEGATION_WINDOW:] if len(words) > NEGATION_WINDOW else words

    for word in window:
        if word in NEGATION_TOKENS:
            return True

    return False


async def check_compliance(text: str) -> Dict:
    """
    Check text for RBI compliance violations with negation awareness.

    Only triggers alerts when:
      1. A predefined trigger phrase is found in the text, AND
      2. It is NOT preceded by a negation word

    Args:
        text: Text to analyse (staff communication).

    Returns:
        dict with keys:
          is_compliant (bool),
          alerts (list of alert dicts with alert_type, severity,
                  risk, risk_label, category, description,
                  matched_text, confidence, timestamp)
    """
    if not text or not text.strip():
        return {"is_compliant": True, "alerts": []}

    text_lower = text.lower().strip()
    alerts: List[Dict] = []
    seen_phrases = set()

    for entry in _KEYWORDS:
        phrase = entry["phrase"]
        risk = entry.get("risk", "medium")
        category_key = entry.get("category", "unknown")

        if phrase not in text_lower:
            continue

        if phrase in seen_phrases:
            continue

        # ── Negation check ────────────────────────────────────
        if _is_negated(text_lower, phrase):
            logger.debug(
                "Compliance: '%s' negated in context — alert suppressed.",
                phrase,
            )
            continue

        seen_phrases.add(phrase)
        category_label = _CATEGORIES.get(category_key, category_key)

        alerts.append({
            "alert_type": category_key,
            "category": category_label,
            "severity": RISK_SEVERITY.get(risk, "warning"),
            "risk": risk,
            "risk_label": RISK_LABELS.get(risk, "🟡 Medium Risk"),
            "description": f"[{category_label}] Detected: \"{phrase}\"",
            "matched_text": phrase,
            "confidence": 1.0,
        })

    is_compliant = len(alerts) == 0

    if not is_compliant:
        logger.warning(
            "Compliance violation: %d alert(s) in: '%s'",
            len(alerts),
            text[:100],
        )
    else:
        logger.debug("Compliance check passed: '%s'", text[:50])

    return {
        "is_compliant": is_compliant,
        "alerts": alerts,
    }
