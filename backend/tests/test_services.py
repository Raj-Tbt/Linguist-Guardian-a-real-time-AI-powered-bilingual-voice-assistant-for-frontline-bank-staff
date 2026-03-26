"""
Linguist-Guardian — Backend Unit Tests.

Tests for:
  • FSM Engine — transitions, step-skipping prevention
  • GenAI Orchestrator — mock intent detection + translation
  • Document Verification — Levenshtein, Jaro-Winkler
  • Compliance Engine — BM25 keyword detection
  • Summary Service — TextRank output
"""

import pytest
import asyncio

# ━━━━━━━━━━━━━━━━  FSM Engine Tests  ━━━━━━━━━━━━━━━━━━━━━━━

from app.services.fsm_engine import (
    get_process_steps,
    get_initial_state,
    get_available_transitions,
    validate_transition,
    advance_state,
    start_process,
    FSMError,
)


class TestFSMEngine:
    """Test suite for the FSM process engine."""

    def test_process_steps_account_opening(self):
        steps = get_process_steps("account_opening")
        assert len(steps) == 5
        assert steps[0] == "form_filling"
        assert steps[-1] == "completed"

    def test_process_steps_loan_inquiry(self):
        steps = get_process_steps("loan_inquiry")
        assert len(steps) == 5
        assert steps[0] == "eligibility_check"

    def test_unknown_process_raises(self):
        with pytest.raises(FSMError):
            get_process_steps("unknown_process")

    def test_initial_state(self):
        assert get_initial_state("account_opening") == "form_filling"
        assert get_initial_state("loan_inquiry") == "eligibility_check"

    def test_available_transitions_from_idle(self):
        transitions = get_available_transitions("account_opening", "idle")
        assert transitions == ["form_filling"]

    def test_available_transitions_linear(self):
        transitions = get_available_transitions("account_opening", "form_filling")
        assert transitions == ["kyc_submission"]

    def test_no_transitions_from_completed(self):
        transitions = get_available_transitions("account_opening", "completed")
        assert transitions == []

    def test_valid_transition(self):
        valid, reason = validate_transition("account_opening", "form_filling", "kyc_submission")
        assert valid is True

    def test_skip_prevention(self):
        valid, reason = validate_transition("account_opening", "form_filling", "approval_pending")
        assert valid is False
        assert "skip" in reason.lower() or "must complete" in reason.lower()

    def test_advance_state_success(self):
        new_state = advance_state("account_opening", "form_filling", "kyc_submission")
        assert new_state == "kyc_submission"

    def test_advance_state_raises_on_skip(self):
        with pytest.raises(FSMError):
            advance_state("account_opening", "form_filling", "completed")

    def test_start_process(self):
        state = start_process("loan_inquiry")
        assert state == "eligibility_check"


# ━━━━━━━━━━━━━━  GenAI Orchestrator Tests  ━━━━━━━━━━━━━━━━━

from app.services.genai_orchestrator import process_text, _mock_detect_intent
from app.services.sarvam_translate import detect_language as _detect_language


class TestGenAIOrchestrator:
    """Test suite for the GenAI orchestrator (mock mode)."""

    def test_detect_language_english(self):
        assert _detect_language("I want a loan") == "en"

    def test_detect_language_hindi(self):
        assert _detect_language("मुझे लोन चाहिए") == "hi"

    def test_mock_intent_loan(self):
        intent, conf = _mock_detect_intent("I want a loan")
        assert intent == "loan_inquiry"
        assert conf > 0

    def test_mock_intent_account(self):
        intent, conf = _mock_detect_intent("open a new account")
        assert intent == "account_opening"

    def test_mock_intent_greeting(self):
        intent, conf = _mock_detect_intent("Hello, good morning")
        assert intent == "greeting"

    @pytest.mark.asyncio
    async def test_process_text_english(self):
        result = await process_text("I want a loan")
        assert result["intent"] == "loan_inquiry"
        assert "translated_text" in result
        assert result["source_language"] == "en"

    @pytest.mark.asyncio
    async def test_process_text_hindi(self):
        result = await process_text("मुझे लोन चाहिए")
        assert result["source_language"] == "hi"
        assert result["target_language"] == "en"


# ━━━━━━━━━━━━━  Document Verification Tests  ━━━━━━━━━━━━━━━

from app.services.document_verification import _normalised_levenshtein, _jaro_winkler


class TestDocumentVerification:
    """Test string similarity functions."""

    def test_levenshtein_identical(self):
        assert _normalised_levenshtein("ABCPS1234K", "ABCPS1234K") == 1.0

    def test_levenshtein_similar(self):
        score = _normalised_levenshtein("ABCPS1234K", "ABCPS1235K")
        assert score >= 0.8  # 1 char difference in 10

    def test_levenshtein_different(self):
        score = _normalised_levenshtein("ABCPS1234K", "XYZAB5678Z")
        assert score < 0.5

    def test_jaro_winkler_identical(self):
        score = _jaro_winkler("Rajesh Kumar", "Rajesh Kumar")
        assert score == 1.0

    def test_jaro_winkler_similar(self):
        score = _jaro_winkler("Rajesh Kumar", "Rajesh Kumaar")
        assert score >= 0.85

    def test_jaro_winkler_different(self):
        score = _jaro_winkler("Rajesh Kumar", "Priya Singh")
        assert score < 0.5


# ━━━━━━━━━━━━━━  Compliance Engine Tests  ━━━━━━━━━━━━━━━━━━

from app.services.compliance_engine import check_bm25, check_compliance


class TestComplianceEngine:
    """Test BM25 keyword detection."""

    def test_bm25_detects_violation(self):
        alerts = check_bm25("I can guarantee you will definitely get approved with no risk")
        # Should match violation phrases about guaranteed returns / no risk
        assert len(alerts) > 0

    def test_bm25_clean_text(self):
        alerts = check_bm25("I would like to open a savings account please")
        assert len(alerts) == 0

    @pytest.mark.asyncio
    async def test_check_compliance_clean(self):
        result = await check_compliance("Please help me open an account")
        assert result["is_compliant"] is True

    @pytest.mark.asyncio
    async def test_check_compliance_violation(self):
        result = await check_compliance("We can bypass the verification process and skip the KYC")
        assert result["is_compliant"] is False
        assert len(result["alerts"]) > 0


# ━━━━━━━━━━━━━━  Summary Service Tests  ━━━━━━━━━━━━━━━━━━━━

from app.services.summary_service import generate_summary, _cosine_similarity_matrix, _pagerank


class TestSummaryService:
    """Test TextRank summary generation."""

    def test_cosine_similarity_identity(self):
        import numpy as np
        emb = np.eye(3)
        sim = _cosine_similarity_matrix(emb)
        assert sim.shape == (3, 3)
        # Diagonal should be 1
        assert abs(sim[0, 0] - 1.0) < 1e-6

    def test_pagerank_uniform(self):
        import numpy as np
        sim = np.ones((3, 3)) * 0.5
        np.fill_diagonal(sim, 0)
        scores = _pagerank(sim)
        assert len(scores) == 3
        # All scores should be roughly equal for uniform graph
        assert abs(scores[0] - scores[1]) < 0.1

    @pytest.mark.asyncio
    async def test_generate_summary_empty(self):
        result = await generate_summary([])
        assert "summary_en" in result

    @pytest.mark.asyncio
    async def test_generate_summary_short(self):
        msgs = ["Hello", "I need a loan", "What is the interest rate?"]
        result = await generate_summary(msgs)
        assert len(result["summary_en"]) > 0
