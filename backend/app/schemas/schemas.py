"""
Linguist-Guardian — Pydantic Schemas.

Request / response models for all REST and WebSocket endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ━━━━━━━━━━━━━━━━━━━━━  Session  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class SessionCreate(BaseModel):
    customer_name: Optional[str] = None
    staff_name: Optional[str] = None
    language: str = "hi"
    process_type: Optional[str] = None  # account_opening | loan_inquiry


class SessionResponse(BaseModel):
    id: str
    customer_name: Optional[str] = None
    staff_name: Optional[str] = None
    language: str
    process_type: Optional[str] = None
    fsm_state: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━━━━  Message  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class MessageCreate(BaseModel):
    role: str  # customer | staff | system
    original_text: str
    language: Optional[str] = None


class MessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    original_text: str
    translated_text: Optional[str] = None
    language: Optional[str] = None
    intent: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━  ComplianceAlert  ━━━━━━━━━━━━━━━━━━━━━━━
class ComplianceAlertResponse(BaseModel):
    id: int
    session_id: str
    alert_type: str
    severity: str
    description: str
    matched_text: Optional[str] = None
    confidence: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ComplianceCheckRequest(BaseModel):
    text: str


class ComplianceCheckResponse(BaseModel):
    is_compliant: bool
    alerts: List[ComplianceAlertResponse] = []


# ━━━━━━━━━━━━━━━━━━━━━  Summary  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class SummaryResponse(BaseModel):
    id: int
    session_id: str
    summary_en: str
    summary_hi: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━  Document Verification  ━━━━━━━━━━━━━━━━━━━━━━
class DocumentVerifyRequest(BaseModel):
    """Simulated OCR extraction of a document."""
    document_type: str = "aadhaar"  # aadhaar | pan
    extracted_name: str
    extracted_number: str
    extracted_dob: str  # DD/MM/YYYY


class DocumentFieldResult(BaseModel):
    field: str
    submitted: str
    reference: str
    method: str
    score: float
    match: bool


class DocumentVerifyResponse(BaseModel):
    verified: bool
    user_found: bool
    results: List[DocumentFieldResult] = []


# ━━━━━━━━━━━━━━━━━━  FSM  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class FSMStateResponse(BaseModel):
    session_id: str
    process_type: Optional[str] = None
    current_state: str
    available_transitions: List[str] = []
    completed_steps: List[str] = []
    all_steps: List[str] = []


class FSMAdvanceRequest(BaseModel):
    target_state: str


# ━━━━━━━━━━━━━━━━━━  GenAI  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class GenAIResponse(BaseModel):
    intent: str
    translated_text: str
    confidence: float = 1.0


# ━━━━━━━━━━━━━━━━━━  WebSocket  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class WSMessage(BaseModel):
    """Generic WebSocket message envelope."""
    type: str  # transcription | translation | compliance | fsm_update | error
    data: dict = {}
