"""
Linguist-Guardian — Core Configuration Module.

Loads environment variables via pydantic-settings and exposes a
singleton ``settings`` object used across the application.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings loaded from .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/linguist_guardian"

    # ── OpenAI ────────────────────────────────────────────────
    openai_api_key: str = ""

    # ── Sarvam AI ─────────────────────────────────────────────
    sarvam_api_key: str = ""

    # ── Whisper ───────────────────────────────────────────────
    whisper_mode: str = "mock"  # "mock" | "api"

    # ── Server ────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ── CORS ──────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> List[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        """Check if we are using SQLite (local dev)."""
        return self.database_url.startswith("sqlite")

    @property
    def openai_enabled(self) -> bool:
        """Check whether a real OpenAI key is configured."""
        return bool(self.openai_api_key and self.openai_api_key.strip())

    @property
    def sarvam_enabled(self) -> bool:
        """Check whether a Sarvam AI API key is configured."""
        return bool(self.sarvam_api_key and self.sarvam_api_key.strip())


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()


settings = get_settings()
