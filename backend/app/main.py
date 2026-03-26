"""
Linguist-Guardian — FastAPI Application Entry Point.

Sets up:
  • CORS middleware (custom, WebSocket-friendly)
  • Lifespan (DB init + seeding on startup)
  • REST router mounting
  • WebSocket endpoint
  • Health check
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

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


# ── CORS (custom middleware — allows WebSocket connections) ───
class CORSMiddlewareHTTPOnly(BaseHTTPMiddleware):
    """
    Custom CORS middleware that applies CORS headers to HTTP
    requests only. WebSocket upgrade requests bypass CORS entirely
    so they are never blocked by origin checks.

    Starlette 1.0.0's built-in CORSMiddleware blocks WebSocket
    connections with 403 Forbidden even with allow_origins=["*"].
    """

    async def dispatch(self, request: Request, call_next):
        # Handle preflight (OPTIONS)
        if request.method == "OPTIONS":
            response = Response(status_code=200)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Max-Age"] = "3600"
            return response

        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.add_middleware(CORSMiddlewareHTTPOnly)


# ── Mount REST routes ─────────────────────────────────────────
app.include_router(api_router, prefix="/api")


# ── WebSocket route ───────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def ws_route(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time audio streaming."""
    await websocket_endpoint(websocket, session_id)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "linguist-guardian"}
