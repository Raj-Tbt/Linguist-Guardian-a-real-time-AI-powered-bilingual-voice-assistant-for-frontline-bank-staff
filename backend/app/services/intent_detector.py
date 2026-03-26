"""
Linguist-Guardian — Dynamic Intent Detection Service.

Detects customer intent from conversation text using STRICT phrase matching.
Only multi-word, specific phrases trigger intents — single generic words
like "loan", "balance", "transfer" are NOT used as they cause false positives.

Key design decisions:
  1. Word-boundary matching (regex \\b) — "account" won't match in "accountability"
  2. Multi-word phrases only — no single generic words
  3. Single-intent output — returns ONLY the best (highest confidence) intent
  4. Confidence scoring — longer keyword match = higher confidence
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

from app.core.logging import logger


# ── Intent Definitions ────────────────────────────────────────
#
# IMPORTANT: Keywords must be specific multi-word phrases.
# DO NOT add single generic words like "loan", "balance", "transfer",
# "issue", "problem", "card" — these trigger false positives in
# normal conversation.

INTENTS: Dict[str, dict] = {
    "account_opening": {
        "label": "Account Opening",
        "icon": "🏦",
        "keywords": [
            "open account", "open an account", "open a account",
            "account opening", "new account", "new bank account",
            "open a bank account", "open my account",
            "savings account open", "current account open",
            "want to open", "start an account", "create account",
            "create a new account", "open savings", "open current",
        ],
        "steps": [
            {"id": "greet", "label": "Welcome & Understand Requirement", "detail": "Greet the customer. Ask which type of account (Savings / Current / Salary)."},
            {"id": "collect_info", "label": "Collect Personal Information", "detail": "Ask for full name, DOB, address, phone number, email."},
            {"id": "kyc_docs", "label": "KYC Document Collection", "detail": "Request Aadhaar, PAN, and a passport photo. Verify originals."},
            {"id": "doc_verify", "label": "Document Verification", "detail": "Use the Document Upload tool to verify identity documents."},
            {"id": "form_fill", "label": "Fill Account Opening Form", "detail": "Help customer fill the form. Confirm nomination details."},
            {"id": "initial_deposit", "label": "Initial Deposit", "detail": "Inform minimum balance requirement. Process initial deposit."},
            {"id": "complete", "label": "Issue Kit & Confirmation", "detail": "Provide account number, cheque book, debit card, netbanking details."},
        ],
    },
    "loan_inquiry": {
        "label": "Loan Enquiry",
        "icon": "💰",
        "keywords": [
            "apply loan", "apply for loan", "apply for a loan",
            "loan enquiry", "loan inquiry",
            "home loan", "personal loan", "car loan", "education loan",
            "vehicle loan", "housing loan", "gold loan",
            "loan application", "loan eligibility", "loan process",
            "need a loan", "want a loan", "need loan",
            "want to take loan", "take a loan",
            "loan amount", "loan interest", "loan rate",
            "emi calculation", "emi for loan",
        ],
        "steps": [
            {"id": "understand", "label": "Understand Loan Requirement", "detail": "Ask loan type (Home / Personal / Vehicle / Education), purpose, and amount."},
            {"id": "eligibility", "label": "Check Eligibility", "detail": "Verify income, employment, CIBIL score. Confirm basic eligibility."},
            {"id": "docs", "label": "Document Collection", "detail": "Request salary slips (3 months), bank statements (6 months), ID & address proof."},
            {"id": "application", "label": "Fill Loan Application", "detail": "Help fill the application form. Record loan amount, tenure, EMI preference."},
            {"id": "processing", "label": "Submit for Processing", "detail": "Submit application. Inform customer about processing time (3-7 days)."},
            {"id": "status", "label": "Approval & Disbursement", "detail": "Communicate approval status. Process disbursement if approved."},
        ],
    },
    "balance_inquiry": {
        "label": "Balance Inquiry",
        "icon": "💳",
        "keywords": [
            "check balance", "check my balance",
            "account balance", "bank balance", "available balance",
            "balance enquiry", "balance inquiry", "balance check",
            "how much balance", "show balance", "see my balance",
            "what is my balance", "know my balance",
        ],
        "steps": [
            {"id": "verify", "label": "Verify Customer Identity", "detail": "Ask for account number or registered mobile number. Verify identity."},
            {"id": "check", "label": "Check & Share Balance", "detail": "Look up the account balance. Share current available balance with customer."},
            {"id": "additional", "label": "Offer Additional Help", "detail": "Ask if they need a mini statement or any other assistance."},
        ],
    },
    "fund_transfer": {
        "label": "Fund Transfer",
        "icon": "🔄",
        "keywords": [
            "fund transfer", "transfer money", "send money",
            "transfer funds", "money transfer",
            "neft transfer", "rtgs transfer", "imps transfer",
            "upi transfer", "wire transfer",
            "want to transfer", "need to transfer",
            "send amount", "transfer amount",
        ],
        "steps": [
            {"id": "verify", "label": "Verify Sender Identity", "detail": "Confirm account holder identity. Ask for account number."},
            {"id": "details", "label": "Collect Transfer Details", "detail": "Get beneficiary name, account number, IFSC code, transfer amount."},
            {"id": "mode", "label": "Select Transfer Mode", "detail": "Recommend NEFT/RTGS/IMPS based on amount and urgency."},
            {"id": "confirm", "label": "Confirm & Process", "detail": "Read back all details for confirmation. Process the transfer."},
            {"id": "receipt", "label": "Provide Confirmation", "detail": "Share transaction reference number and estimated arrival time."},
        ],
    },
    "card_services": {
        "label": "Card Services",
        "icon": "💳",
        "keywords": [
            "debit card", "credit card", "atm card",
            "lost card", "lost my card", "card is lost",
            "block card", "block my card", "card block",
            "new card", "replace card", "card replacement",
            "card pin", "reset pin", "card activation",
            "activate card", "activate my card",
        ],
        "steps": [
            {"id": "identify", "label": "Identify Card Issue", "detail": "Ask if it's about new card, lost/damaged card, PIN, or activation."},
            {"id": "verify", "label": "Verify Identity", "detail": "Confirm customer identity with account details."},
            {"id": "action", "label": "Take Required Action", "detail": "Block card / issue replacement / reset PIN / activate as needed."},
            {"id": "confirm", "label": "Confirm & Follow-up", "detail": "Confirm the action taken. Provide timeline for card delivery if applicable."},
        ],
    },
    "complaint": {
        "label": "Complaint / Grievance",
        "icon": "📝",
        "keywords": [
            "file complaint", "file a complaint",
            "lodge complaint", "lodge a complaint",
            "raise complaint", "raise a complaint",
            "register complaint", "register a complaint",
            "wrong charge", "wrong charges",
            "unauthorized transaction", "unauthorized debit",
            "file grievance", "raise grievance",
            "want to complain", "i have a complaint",
        ],
        "steps": [
            {"id": "listen", "label": "Listen & Acknowledge", "detail": "Listen patiently. Acknowledge the concern empathetically."},
            {"id": "details", "label": "Collect Complaint Details", "detail": "Record nature of complaint, date, amount (if financial), account details."},
            {"id": "register", "label": "Register Complaint", "detail": "Log the complaint in the system. Generate complaint reference number."},
            {"id": "resolve", "label": "Attempt Resolution", "detail": "If resolvable immediately, fix it. Otherwise, escalate to relevant team."},
            {"id": "confirm", "label": "Confirm & Follow-up", "detail": "Share reference number. Inform resolution timeline (typically 7-15 days)."},
        ],
    },
    "fixed_deposit": {
        "label": "Fixed Deposit",
        "icon": "🏛️",
        "keywords": [
            "fixed deposit", "open fd", "open an fd",
            "fd account", "term deposit",
            "fd rate", "fd interest", "fd interest rate",
            "recurring deposit", "rd account",
            "want to invest in fd", "create fd",
            "new fixed deposit", "new fd",
        ],
        "steps": [
            {"id": "understand", "label": "Understand Requirement", "detail": "Ask FD amount, tenure, and whether it's a new FD or renewal."},
            {"id": "rates", "label": "Share Interest Rates", "detail": "Inform current FD rates for different tenures. Mention senior citizen benefits."},
            {"id": "kyc", "label": "Verify KYC", "detail": "Ensure KYC is complete. Request documents if needed."},
            {"id": "process", "label": "Process FD", "detail": "Fill FD application. Confirm amount, tenure, maturity instructions."},
            {"id": "receipt", "label": "Issue FD Receipt", "detail": "Provide FD receipt/certificate with all details."},
        ],
    },
}


# ── Pre-compiled regex patterns for word-boundary matching ────
_PATTERNS: List[tuple] = []  # (compiled_regex, intent_key, keyword, word_count)

for intent_key, intent_data in INTENTS.items():
    for kw in intent_data["keywords"]:
        # Build regex with word boundaries: \bopen account\b
        pattern = re.compile(r"\b" + re.escape(kw.lower()) + r"\b", re.IGNORECASE)
        word_count = len(kw.split())
        _PATTERNS.append((pattern, intent_key, kw, word_count))

# Sort by word count (most words first) — more specific phrases match first
_PATTERNS.sort(key=lambda x: x[3], reverse=True)


def detect_intents(text: str) -> List[dict]:
    """
    Detect the SINGLE best-matching intent from text.

    Uses word-boundary regex matching with confidence scoring.
    Longer keyword matches score higher.
    Returns at most ONE intent (the highest confidence match)
    to avoid distracting staff with unrelated suggestions.

    Returns:
        List with 0 or 1 intent dicts.
    """
    if not text or not text.strip():
        return []

    text_lower = text.lower().strip()

    # Score each intent by the longest matching keyword
    best_match = None
    best_score = 0

    for pattern, intent_key, keyword, word_count in _PATTERNS:
        if pattern.search(text_lower):
            # Confidence score = word count of matched keyword
            # Longer/more specific phrases get higher scores
            score = word_count
            if score > best_score:
                best_score = score
                intent_data = INTENTS[intent_key]
                best_match = {
                    "intent": intent_key,
                    "label": intent_data["label"],
                    "icon": intent_data["icon"],
                    "matched_keyword": keyword,
                    "confidence": min(score / 4.0, 1.0),  # Normalize: 4+ words = 100%
                    "steps": intent_data["steps"],
                }

    if best_match:
        logger.info(
            "Intent detected: %s (confidence=%.0f%%) from '%s'",
            best_match["intent"],
            best_match["confidence"] * 100,
            text[:80],
        )
        return [best_match]

    return []


def get_guidance(intent_key: str) -> Optional[dict]:
    """
    Get guidance steps for a specific intent.

    Returns intent dict with steps, or None if unknown.
    """
    if intent_key not in INTENTS:
        return None

    data = INTENTS[intent_key]
    return {
        "intent": intent_key,
        "label": data["label"],
        "icon": data["icon"],
        "steps": data["steps"],
    }
