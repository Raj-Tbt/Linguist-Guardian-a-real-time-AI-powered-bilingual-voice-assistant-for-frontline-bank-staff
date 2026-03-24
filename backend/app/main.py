"""
Linguist-Guardian — FastAPI Application Entry Point.

Sets up:
  • CORS middleware
  • Lifespan (DB init + seeding on startup)
  • REST router mounting
  • WebSocket endpoint
  • Health check
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import logger
from app.db.database import async_session, create_tables
from app.db.seed import seed_fake_users
from app.api.routes import router as api_router
from app.websocket.handler import websocket_endpoint


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    On startup:
      1. Create all DB tables (idempotent)
      2. Seed fake users if table is empty
    """
    logger.info("Starting Linguist-Guardian backend…")
    await create_tables()

    async with async_session() as session:
        await seed_fake_users(session)

    logger.info("Database initialised and seeded.")
    yield
    logger.info("Shutting down Linguist-Guardian backend.")


# ── App factory ───────────────────────────────────────────────
app = FastAPI(
    title="Linguist-Guardian API",
    description="Real-time GenAI Banking Assistant — bilingual voice, compliance, FSM, document verification",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount REST routes ─────────────────────────────────────────
app.include_router(api_router, prefix="/api")


# ── WebSocket route ───────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def ws_route(websocket, session_id: str):
    """WebSocket endpoint for real-time audio streaming."""
    await websocket_endpoint(websocket, session_id)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "linguist-guardian"}
