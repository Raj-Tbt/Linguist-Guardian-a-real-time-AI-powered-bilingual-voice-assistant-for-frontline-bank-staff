"""
Linguist-Guardian — WebSocket Handler.

Manages real-time audio streaming sessions:
  1. Client connects with a session ID
  2. Client sends audio chunks (binary) or JSON control messages
  3. Server processes through the pipeline:
       Audio → STT + Sentiment → GenAI → Compliance → FSM update
  4. Server streams results back as JSON messages

Message types (server → client):
  • transcription  — STT result
  • translation    — GenAI intent + translation
  • compliance     — compliance check result
  • sentiment      — stress score + de-escalation flag
  • fsm_update     — current FSM state
  • voice_response — text response (emotion-adaptive)
  • error          — error message
  • connected      — connection confirmation
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.logging import logger
from app.db.database import async_session
from app.models.models import ComplianceAlert, Message, Session
from app.services import (
    compliance_engine,
    fsm_engine,
    genai_orchestrator,
    intent_detector,
    queue_manager,
    sentiment_analyzer,
    speech_to_text,
    voice_response,
)


class ConnectionManager:
    """
    Manages active WebSocket connections.

    Tracks connections by session_id so we can broadcast
    to all participants in a session.
    """

    def __init__(self):
        # session_id → list of WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info("WS connected: session=%s (total=%d)", session_id, len(self.active_connections[session_id]))

    def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket connection."""
        if session_id in self.active_connections:
            self.active_connections[session_id] = [
                ws for ws in self.active_connections[session_id] if ws != websocket
            ]
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info("WS disconnected: session=%s", session_id)

    async def send_to_session(self, session_id: str, message: dict) -> None:
        """Send a JSON message to all connections in a session."""
        if session_id in self.active_connections:
            dead = []
            for ws in self.active_connections[session_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            # Clean up dead connections
            for ws in dead:
                self.disconnect(ws, session_id)


# Module-level singleton
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    """
    Main WebSocket handler.

    Processes incoming audio chunks and text messages through
    the full AI pipeline and streams results back.
    """
    await manager.connect(websocket, session_id)

    # Send connection confirmation
    await websocket.send_json({
        "type": "connected",
        "data": {"session_id": session_id, "message": "Connected to Linguist-Guardian"},
    })

    try:
        while True:
            # WebSocket can receive text (JSON) or binary (audio) data
            try:
                # Try to receive text message first (JSON control messages)
                raw = await websocket.receive()

                if "text" in raw:
                    await _handle_text_message(websocket, session_id, raw["text"])
                elif "bytes" in raw:
                    await _handle_audio_chunk(websocket, session_id, raw["bytes"])

            except WebSocketDisconnect:
                break

    except Exception as exc:
        logger.error("WS error for session %s: %s", session_id, exc)
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(exc)},
            })
        except Exception:
            pass

    finally:
        manager.disconnect(websocket, session_id)


async def _handle_text_message(
    websocket: WebSocket,
    session_id: str,
    text: str,
) -> None:
    """
    Handle a text (JSON) message from the client.

    Expected format: { "type": "...", "data": { ... } }
    Supported types:
      • "text_input" — process a text message through the pipeline
      • "start_process" — initialise an FSM process
      • "advance_fsm" — advance the FSM state
    """
    try:
        msg = json.loads(text)
    except json.JSONDecodeError:
        await websocket.send_json({
            "type": "error",
            "data": {"message": "Invalid JSON"},
        })
        return

    msg_type = msg.get("type", "")
    data = msg.get("data", {})

    if msg_type == "text_input":
        await _process_text_input(websocket, session_id, data)
    elif msg_type == "start_process":
        await _handle_start_process(websocket, session_id, data)
    elif msg_type == "advance_fsm":
        await _handle_advance_fsm(websocket, session_id, data)
    else:
        await websocket.send_json({
            "type": "error",
            "data": {"message": f"Unknown message type: {msg_type}"},
        })


async def _process_text_input(
    websocket: WebSocket,
    session_id: str,
    data: dict,
) -> None:
    """
    Process a text message through the correct bidirectional workflow:

    CUSTOMER sends → translate to English → show on STAFF dashboard
      (staff sees the question, reads it, and manually types a reply)

    STAFF sends → translate to customer's language → show on CUSTOMER dashboard
      (customer sees the staff's reply in their own language)

    Both paths also run: compliance check, intent detection, queue update.
    """
    text = data.get("text", "")
    role = data.get("role", "customer")
    language = data.get("language")

    if not text:
        return

    # Fetch customer language from the session
    customer_language = "hi"  # default fallback
    async with async_session() as db:
        session = await db.get(Session, session_id)
        if session and session.language:
            customer_language = session.language

    # Determine target language based on role:
    #   Staff speaks English → translate to customer's language
    #   Customer speaks their language → translate to English for staff
    if role == "staff":
        target_lang = customer_language
    else:
        target_lang = "en"

    # Step 1: GenAI — intent detection + translation via Sarvam AI
    genai_result = await genai_orchestrator.process_text(text, target_language=target_lang)

    # Step 2: Send the message to BOTH dashboards with role included
    # Each dashboard will know:
    #   - If role matches their own → it's an echo of their sent message (skip)
    #   - If role differs → it's an incoming message from the other party (display)
    await manager.send_to_session(session_id, {
        "type": "message",
        "data": {
            "role": role,
            "original_text": text,
            "translated_text": genai_result["translated_text"],
            "intent": genai_result["intent"],
            "confidence": genai_result["confidence"],
            "source_language": genai_result["source_language"],
            "target_language": genai_result["target_language"],
        },
    })

    # Step 3: Dynamic intent detection — detect banking intents from customer text
    if role == "customer":
        # Use the English text for intent detection (either the original or translated)
        english_text = genai_result["translated_text"] if target_lang == "en" else text
        detected = intent_detector.detect_intents(english_text)

        if detected:
            await manager.send_to_session(session_id, {
                "type": "guidance_update",
                "data": {
                    "detected_intents": detected,
                },
            })

    # Step 4: Compliance check (runs for all messages)
    compliance_result = await compliance_engine.check_compliance(text)

    if not compliance_result["is_compliant"]:
        await manager.send_to_session(session_id, {
            "type": "compliance",
            "data": compliance_result,
        })

    # Step 5: Update urgency queue with latest intent
    queue_manager.enqueue(
        session_id=session_id,
        intent=genai_result["intent"],
    )

    # Step 5: Persist message to DB
    async with async_session() as db:
        message = Message(
            session_id=session_id,
            role=role,
            original_text=text,
            translated_text=genai_result["translated_text"],
            language=genai_result["source_language"],
            intent=genai_result["intent"],
        )
        db.add(message)

        # Persist compliance alerts
        for alert_data in compliance_result.get("alerts", []):
            alert = ComplianceAlert(
                session_id=session_id,
                alert_type=alert_data["alert_type"],
                severity=alert_data["severity"],
                description=alert_data["description"],
                matched_text=alert_data.get("matched_text"),
                confidence=alert_data.get("confidence"),
            )
            db.add(alert)

        await db.commit()



async def _handle_audio_chunk(
    websocket: WebSocket,
    session_id: str,
    audio_bytes: bytes,
) -> None:
    """
    Process a complete audio recording:
    1. Fetch customer's language from session DB
    2. STT (Whisper/Sarvam) + Sentiment (MFCC/YIN) in parallel
    3. Send transcription to customer dashboard
    4. Feed transcription into text pipeline for translation + routing
    """
    if not audio_bytes or len(audio_bytes) < 100:
        return  # Skip tiny fragments

    # Fetch customer language from session (Fix #2 + #5)
    customer_language = "hi"
    async with async_session() as db:
        session = await db.get(Session, session_id)
        if session and session.language:
            customer_language = session.language

    # Step 1 + 2: Run STT and sentiment analysis in PARALLEL
    stt_task = asyncio.create_task(
        speech_to_text.transcribe_audio(audio_bytes, language=customer_language)
    )
    sentiment_task = asyncio.create_task(
        sentiment_analyzer.analyse_audio(audio_bytes)
    )

    stt_result, sentiment_result = await asyncio.gather(
        stt_task, sentiment_task
    )

    # Skip empty transcriptions
    if not stt_result.get("text", "").strip():
        return

    # Send transcription to customer dashboard (shows what mic captured)
    await manager.send_to_session(session_id, {
        "type": "transcription",
        "data": {
            "text": stt_result["text"],
            "language": stt_result["language"],
            "confidence": stt_result["confidence"],
        },
    })

    # Send sentiment to staff dashboard
    await manager.send_to_session(session_id, {
        "type": "sentiment",
        "data": {
            "stress_score": sentiment_result["stress_score"],
            "de_escalate": sentiment_result["de_escalate"],
            "pitch_mean": sentiment_result["pitch_mean"],
            "pitch_std": sentiment_result["pitch_std"],
        },
    })

    # Update urgency queue with stress
    queue_manager.enqueue(
        session_id=session_id,
        stress_score=sentiment_result["stress_score"],
    )

    # Step 3: Feed transcription through the text pipeline
    # (translates to English + shows on staff dashboard)
    await _process_text_input(websocket, session_id, {
        "text": stt_result["text"],
        "role": "customer",
        "language": stt_result["language"],
    })


async def _handle_start_process(
    websocket: WebSocket,
    session_id: str,
    data: dict,
) -> None:
    """Start a new FSM process for the session."""
    process_type = data.get("process_type", "")

    if process_type not in fsm_engine.PROCESSES:
        await websocket.send_json({
            "type": "error",
            "data": {"message": f"Unknown process type: {process_type}"},
        })
        return

    async with async_session() as db:
        session = await db.get(Session, session_id)
        if not session:
            await websocket.send_json({
                "type": "error",
                "data": {"message": "Session not found"},
            })
            return

        initial_state = fsm_engine.start_process(process_type)
        session.process_type = process_type
        session.fsm_state = initial_state
        await db.commit()

    info = fsm_engine.get_state_info(process_type, initial_state)

    await manager.send_to_session(session_id, {
        "type": "fsm_update",
        "data": {
            "process_type": process_type,
            **info,
        },
    })


async def _handle_advance_fsm(
    websocket: WebSocket,
    session_id: str,
    data: dict,
) -> None:
    """Advance the FSM to the next state."""
    target_state = data.get("target_state", "")

    async with async_session() as db:
        session = await db.get(Session, session_id)
        if not session:
            await websocket.send_json({
                "type": "error",
                "data": {"message": "Session not found"},
            })
            return

        if not session.process_type:
            await websocket.send_json({
                "type": "error",
                "data": {"message": "No process started"},
            })
            return

        try:
            new_state = fsm_engine.advance_state(
                session.process_type,
                session.fsm_state,
                target_state,
            )
            session.fsm_state = new_state
            await db.commit()

            info = fsm_engine.get_state_info(session.process_type, new_state)

            await manager.send_to_session(session_id, {
                "type": "fsm_update",
                "data": {
                    "process_type": session.process_type,
                    **info,
                },
            })

        except fsm_engine.FSMError as exc:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(exc)},
            })
