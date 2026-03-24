"""
Linguist-Guardian — SQLAlchemy ORM Models.

Defines all database tables:
  • Session   — a customer-staff interaction session
  • Message   — individual messages within a session
  • ComplianceAlert — flagged compliance violations
  • Summary   — bilingual session summaries
  • FakeUser  — mock KYC dataset for document verification
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    Integer,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(timezone.utc)


def _uuid() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


# ━━━━━━━━━━━━━━━━━━━━━━━━  Session  ━━━━━━━━━━━━━━━━━━━━━━━━━
class Session(Base):
    """Represents a customer–staff interaction session."""

    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=_uuid)
    customer_name = Column(String(100), nullable=True)
    staff_name = Column(String(100), nullable=True)
    language = Column(String(20), default="hi")  # customer language
    process_type = Column(String(50), nullable=True)  # e.g. account_opening, loan_inquiry
    fsm_state = Column(String(50), default="idle")
    status = Column(String(20), default="active")  # active | completed
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    compliance_alerts = relationship("ComplianceAlert", back_populates="session", cascade="all, delete-orphan")
    summaries = relationship("Summary", back_populates="session", cascade="all, delete-orphan")


# ━━━━━━━━━━━━━━━━━━━━━━━━  Message  ━━━━━━━━━━━━━━━━━━━━━━━━━
class Message(Base):
    """A single message (text or transcribed audio) in a session."""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    role = Column(String(20), nullable=False)  # customer | staff | system
    original_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=True)
    language = Column(String(20), nullable=True)
    intent = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    session = relationship("Session", back_populates="messages")


# ━━━━━━━━━━━━━━━━━━━━━  ComplianceAlert  ━━━━━━━━━━━━━━━━━━━━
class ComplianceAlert(Base):
    """A compliance violation detected during a session."""

    __tablename__ = "compliance_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    alert_type = Column(String(30), nullable=False)  # keyword | semantic
    severity = Column(String(20), default="warning")  # warning | critical
    description = Column(Text, nullable=False)
    matched_text = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    session = relationship("Session", back_populates="compliance_alerts")


# ━━━━━━━━━━━━━━━━━━━━━━━━  Summary  ━━━━━━━━━━━━━━━━━━━━━━━━━
class Summary(Base):
    """Bilingual session summary produced by TextRank."""

    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"), nullable=False)
    summary_en = Column(Text, nullable=False)
    summary_hi = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    session = relationship("Session", back_populates="summaries")


# ━━━━━━━━━━━━━━━━━━━━━━━  FakeUser  ━━━━━━━━━━━━━━━━━━━━━━━━━
class FakeUser(Base):
    """Mock KYC user for document verification testing."""

    __tablename__ = "fake_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    pan_number = Column(String(10), nullable=False, unique=True)
    aadhaar_number = Column(String(12), nullable=False, unique=True)
    dob = Column(String(10), nullable=False)  # DD/MM/YYYY
    address = Column(String(250), nullable=True)
    phone = Column(String(15), nullable=True)
