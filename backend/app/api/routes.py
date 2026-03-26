"""
Linguist-Guardian — REST API Routes.

All HTTP endpoints for:
  • Session management (CRUD)
  • Message retrieval
  • Compliance checking
  • Document verification
  • FSM state management
  • Summary generation
  • Voice response
  • Fake users listing
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.db.database import get_db
from app.models.models import (
    ComplianceAlert,
    FakeUser,
    Message,
    Session,
    Summary,
)
from app.schemas.schemas import (
    ComplianceAlertResponse,
    ComplianceCheckRequest,
    ComplianceCheckResponse,
    DocumentVerifyRequest,
    DocumentVerifyResponse,
    FSMAdvanceRequest,
    FSMStateResponse,
    GenAIResponse,
    MessageCreate,
    MessageResponse,
    SessionCreate,
    SessionResponse,
    SummaryResponse,
)
from app.services import (
    compliance_engine,
    document_ocr,
    document_verification,
    fsm_engine,
    genai_orchestrator,
    queue_manager,
    summary_service,
    tts_service,
    voice_response,
)

router = APIRouter()


# ━━━━━━━━━━━━━━━━━━━━  Sessions  ━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/sessions", response_model=SessionResponse, tags=["Sessions"])
async def create_session(
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new interaction session. Auto-closes old active sessions."""
    # Auto-close ALL previous active sessions (single session view)
    old_sessions = await db.execute(
        select(Session).where(Session.status == "active")
    )
    for old in old_sessions.scalars().all():
        old.status = "completed"
    await db.flush()

    session = Session(
        customer_name=payload.customer_name,
        staff_name=payload.staff_name,
        language=payload.language,
        process_type=payload.process_type,
    )

    # If a process type is specified, initialise the FSM
    if payload.process_type and payload.process_type in fsm_engine.PROCESSES:
        session.fsm_state = fsm_engine.start_process(payload.process_type)

    db.add(session)
    await db.flush()
    await db.refresh(session)
    logger.info("Session created: %s (old sessions closed)", session.id)
    return session


@router.get("/sessions", response_model=List[SessionResponse], tags=["Sessions"])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """List all sessions, newest first."""
    result = await db.execute(
        select(Session).order_by(Session.created_at.desc())
    )
    return result.scalars().all()


@router.get("/sessions/active", response_model=List[SessionResponse], tags=["Sessions"])
async def list_active_sessions(db: AsyncSession = Depends(get_db)):
    """List active sessions that a customer can join."""
    result = await db.execute(
        select(Session)
        .where(Session.status == "active")
        .order_by(Session.created_at.desc())
    )
    return result.scalars().all()


@router.post("/sessions/{session_id}/join", response_model=SessionResponse, tags=["Sessions"])
async def join_session(
    session_id: str,
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Customer joins an existing staff session."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.status != "active":
        raise HTTPException(400, "Session is not active")

    # Update session with customer info
    if payload.customer_name:
        session.customer_name = payload.customer_name
    if payload.language:
        session.language = payload.language

    await db.flush()
    await db.refresh(session)
    logger.info("Customer joined session: %s (lang=%s)", session_id, payload.language)
    return session


@router.get("/sessions/{session_id}", response_model=SessionResponse, tags=["Sessions"])
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get a session by ID."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session


@router.post("/sessions/{session_id}/end", response_model=SessionResponse, tags=["Sessions"])
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """End a session — marks it as completed."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    session.status = "completed"
    await db.flush()
    await db.refresh(session)
    logger.info("Session ended: %s", session_id)
    return session


# ━━━━━━━━━━━━━━━━━━━━  Messages  ━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/sessions/{session_id}/messages",
    response_model=List[MessageResponse],
    tags=["Messages"],
)
async def get_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get all messages for a session."""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
    )
    return result.scalars().all()


@router.post(
    "/sessions/{session_id}/messages",
    response_model=MessageResponse,
    tags=["Messages"],
)
async def add_message(
    session_id: str,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Add a message to a session.

    Automatically runs GenAI orchestrator for intent detection
    and translation.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Run GenAI orchestrator
    genai_result = await genai_orchestrator.process_text(
        payload.original_text,
        target_language="en" if payload.language == "hi" else "hi",
    )

    message = Message(
        session_id=session_id,
        role=payload.role,
        original_text=payload.original_text,
        translated_text=genai_result["translated_text"],
        language=payload.language or genai_result["source_language"],
        intent=genai_result["intent"],
    )

    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


# ━━━━━━━━━━━━━━━━━━  Compliance  ━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/sessions/{session_id}/compliance-check",
    response_model=ComplianceCheckResponse,
    tags=["Compliance"],
)
async def check_compliance(
    session_id: str,
    payload: ComplianceCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run compliance check on the provided text.

    Stores any alerts in the database and returns the result.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    result = await compliance_engine.check_compliance(payload.text)

    # Persist alerts
    alert_models = []
    for alert_data in result["alerts"]:
        alert = ComplianceAlert(
            session_id=session_id,
            alert_type=alert_data["alert_type"],
            severity=alert_data["severity"],
            description=alert_data["description"],
            matched_text=alert_data.get("matched_text"),
            confidence=alert_data.get("confidence"),
        )
        db.add(alert)
        await db.flush()
        await db.refresh(alert)
        alert_models.append(alert)

    return ComplianceCheckResponse(
        is_compliant=result["is_compliant"],
        alerts=[ComplianceAlertResponse.model_validate(a) for a in alert_models],
    )


@router.get(
    "/sessions/{session_id}/compliance-alerts",
    response_model=List[ComplianceAlertResponse],
    tags=["Compliance"],
)
async def get_compliance_alerts(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all compliance alerts for a session."""
    result = await db.execute(
        select(ComplianceAlert)
        .where(ComplianceAlert.session_id == session_id)
        .order_by(ComplianceAlert.created_at.desc())
    )
    return result.scalars().all()


# ━━━━━━━━━━━━━━━━  Document Verification  ━━━━━━━━━━━━━━━━━━

@router.post(
    "/verify-document",
    response_model=DocumentVerifyResponse,
    tags=["Documents"],
)
async def verify_document(
    payload: DocumentVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a document against the fake user database.

    Compares document number (Levenshtein), name (Jaro-Winkler),
    and DOB (exact match).
    """
    return await document_verification.verify_document(payload, db)


@router.post("/verify-document-upload", tags=["Documents"])
async def verify_document_upload(
    file: UploadFile = File(...),
    document_type: str = Form("aadhaar"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload an identity document image for AI-powered verification.

    1. AI Vision extracts name, number, DOB from the image
    2. Extracted data is matched against the fake-user database
       using Jaro-Winkler + Levenshtein similarity
    3. Returns extracted data, per-field match results, and verdict
    """
    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.")

    image_bytes = await file.read()

    # Step 1: AI OCR extraction
    extraction = await document_ocr.extract_document_data(
        image_bytes,
        filename=file.filename or "document.jpg",
        document_type=document_type,
    )

    if "error" in extraction:
        return {
            "extraction": extraction,
            "verification": None,
            "status": "rejected",
            "message": extraction["error"],
        }

    # Step 2: Feed extracted data into verification pipeline
    verify_request = DocumentVerifyRequest(
        document_type=extraction.get("document_type", document_type),
        extracted_name=extraction.get("extracted_name", ""),
        extracted_number=extraction.get("extracted_number", ""),
        extracted_dob=extraction.get("extracted_dob", ""),
    )

    verification = await document_verification.verify_document(verify_request, db)

    # Step 3: Determine overall status
    if not verification.user_found:
        status = "not_found"
    elif verification.verified:
        status = "verified"
    else:
        # Check if partial match (some fields match)
        matching = sum(1 for r in verification.results if r.match)
        total = len(verification.results)
        if matching > 0:
            status = "needs_review"
        else:
            status = "not_verified"

    return {
        "extraction": extraction,
        "verification": {
            "verified": verification.verified,
            "user_found": verification.user_found,
            "results": [r.model_dump() for r in verification.results],
        },
        "status": status,
    }

@router.get(
    "/sessions/{session_id}/fsm-state",
    response_model=FSMStateResponse,
    tags=["FSM"],
)
async def get_fsm_state(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the current FSM state for a session."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    info = fsm_engine.get_state_info(session.process_type, session.fsm_state)

    return FSMStateResponse(
        session_id=session_id,
        process_type=session.process_type,
        current_state=info["current_state"],
        available_transitions=info["available_transitions"],
        completed_steps=info["completed_steps"],
        all_steps=info["all_steps"],
    )


@router.post(
    "/sessions/{session_id}/fsm-advance",
    response_model=FSMStateResponse,
    tags=["FSM"],
)
async def advance_fsm(
    session_id: str,
    payload: FSMAdvanceRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Advance the FSM to the next state.

    Validates the transition — returns 400 if the step would be skipped.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    if not session.process_type:
        raise HTTPException(400, "No process type set for this session.")

    try:
        new_state = fsm_engine.advance_state(
            session.process_type,
            session.fsm_state,
            payload.target_state,
        )
    except fsm_engine.FSMError as exc:
        raise HTTPException(400, str(exc))

    session.fsm_state = new_state
    await db.flush()

    info = fsm_engine.get_state_info(session.process_type, new_state)

    return FSMStateResponse(
        session_id=session_id,
        process_type=session.process_type,
        current_state=info["current_state"],
        available_transitions=info["available_transitions"],
        completed_steps=info["completed_steps"],
        all_steps=info["all_steps"],
    )


# ━━━━━━━━━━━━━━━━━━━  Text-to-Speech  ━━━━━━━━━━━━━━━━━━━━━━

class TTSRequest(BaseModel):
    text: str
    language: str = "hi"

@router.post("/tts", tags=["TTS"])
async def synthesize_speech(payload: TTSRequest):
    """
    Convert text to speech using Sarvam AI TTS.

    Returns WAV audio as a streaming response.
    For English, the frontend uses browser SpeechSynthesis instead.
    """
    from fastapi.responses import Response

    if payload.language == "en":
        # English handled by browser SpeechSynthesis — no API call needed
        return Response(
            content='{"use_browser": true}',
            media_type="application/json",
            status_code=200,
        )

    audio_bytes = await tts_service.text_to_speech(
        text=payload.text,
        language=payload.language,
    )

    if audio_bytes is None:
        raise HTTPException(503, "TTS service unavailable. Check Sarvam AI API key.")

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline"},
    )


# ━━━━━━━━━━━━━━━━━━━━  Summary  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/sessions/{session_id}/summary",
    response_model=SummaryResponse,
    tags=["Summary"],
)
async def generate_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a bilingual summary for the session.

    Uses TextRank over all messages in the session.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Fetch all messages
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()

    if not messages:
        raise HTTPException(400, "No messages in this session yet. Start a conversation first.")

    texts = [m.original_text for m in messages if m.original_text]

    try:
        summary_data = await summary_service.generate_summary(texts)
    except Exception as exc:
        logger.error("Summary generation failed: %s", exc)
        raise HTTPException(500, f"Summary generation failed: {str(exc)}")

    summary = Summary(
        session_id=session_id,
        summary_en=summary_data["summary_en"],
        summary_hi=summary_data.get("summary_hi"),
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)
    return summary


# ━━━━━━━━━━━━━━━━  Voice Response  ━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/voice-response", tags=["Voice"])
async def get_voice_response(intent: str = "general_query", language: str = "en"):
    """
    Generate a voice response for the given intent.

    Returns text (TTS mock — no actual audio).
    """
    return await voice_response.generate_response(intent, language)


# ━━━━━━━━━━━━━━━━━━  GenAI  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/genai/process", response_model=GenAIResponse, tags=["GenAI"])
async def process_text(text: str, target_language: str = None):
    """
    Run the GenAI orchestrator on a text input.

    Returns intent + translated text.
    """
    result = await genai_orchestrator.process_text(text, target_language)
    return GenAIResponse(
        intent=result["intent"],
        translated_text=result["translated_text"],
        confidence=result.get("confidence", 1.0),
    )


# ━━━━━━━━━━━━━━━  Document Upload + Verify  ━━━━━━━━━━━━━━━━━━

@router.post("/verify-document-upload", tags=["Documents"])
async def verify_document_upload(
    file: UploadFile = File(...),
    document_type: str = Form("aadhaar"),
    db: AsyncSession = Depends(get_db),
):
    """
    End-to-end document verification:

    1. Receive uploaded document image (Aadhaar / PAN)
    2. Extract data using GPT-4o Vision OCR
    3. Match extracted data against the database using Jaro-Winkler + Levenshtein
    4. Return extraction results, per-field match scores, and verification status

    Status codes:
      • verified    — all fields match (✅ Valid Customer)
      • needs_review — partial match (⚠️ Needs Review)
      • not_verified — no match at all (❌ Invalid Customer)
      • not_found   — no matching user in DB (🔍 No Match)
      • rejected    — image could not be processed (🚫 Rejected)
    """
    # Read file bytes
    image_bytes = await file.read()

    # Step 1: GPT-4o Vision OCR extraction
    extraction = await document_ocr.extract_document_data(
        image_bytes=image_bytes,
        filename=file.filename or "document.jpg",
        document_type=document_type,
    )

    # If extraction failed, return error
    if extraction.get("error"):
        return {
            "status": "rejected",
            "extraction": extraction,
            "verification": None,
        }

    # Step 2: Verify against database
    verify_request = DocumentVerifyRequest(
        document_type=extraction.get("document_type", document_type),
        extracted_name=extraction.get("extracted_name", ""),
        extracted_number=extraction.get("extracted_number", ""),
        extracted_dob=extraction.get("extracted_dob", ""),
    )

    verification = await document_verification.verify_document(verify_request, db)

    # Step 3: Determine final status
    if not verification.user_found:
        status = "not_found"
    elif verification.verified:
        status = "verified"
    else:
        # Check how many fields match for needs_review vs not_verified
        match_count = sum(1 for r in verification.results if r.match)
        if match_count > 0:
            status = "needs_review"
        else:
            status = "not_verified"

    # Step 4: Calculate overall confidence score
    if verification.results:
        overall_confidence = sum(r.score for r in verification.results) / len(verification.results)
    else:
        overall_confidence = 0.0

    return {
        "status": status,
        "overall_confidence": round(overall_confidence, 4),
        "extraction": extraction,
        "verification": {
            "verified": verification.verified,
            "user_found": verification.user_found,
            "results": [
                {
                    "field": r.field,
                    "submitted": r.submitted,
                    "reference": r.reference,
                    "method": r.method,
                    "score": r.score,
                    "match": r.match,
                }
                for r in verification.results
            ],
        },
    }


# ━━━━━━━━━━━━━━━  Fake Users  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/fake-users", tags=["Data"])
async def list_fake_users(db: AsyncSession = Depends(get_db)):
    """List all fake users in the dataset (for testing)."""
    result = await db.execute(select(FakeUser))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "pan_number": u.pan_number,
            "aadhaar_number": u.aadhaar_number,
            "dob": u.dob,
            "address": u.address,
            "phone": u.phone,
        }
        for u in users
    ]


# ━━━━━━━━━━━━━━━  Queue Management  ━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/queue", tags=["Queue"])
async def get_queue():
    """
    Get the current branch priority queue.

    Returns customers sorted by urgency (most urgent first).
    Each entry includes: session_id, customer_name, intent,
    stress_score, urgency, wait_minutes, doc_pending.
    """
    return {
        "queue": queue_manager.get_queue_state(),
        "size": queue_manager.get_queue_size(),
    }


@router.get("/queue/size", tags=["Queue"])
async def get_queue_size():
    """Get the number of customers in the queue."""
    return {"size": queue_manager.get_queue_size()}
