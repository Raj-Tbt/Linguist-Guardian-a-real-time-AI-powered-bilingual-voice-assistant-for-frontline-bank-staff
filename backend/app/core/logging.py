"""
Linguist-Guardian — Structured Logging Setup.

Provides a pre-configured logger with consistent formatting
and level control for the entire application.
"""

from __future__ import annotations

import logging
import sys


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """
    Configure and return the application-wide logger.

    Args:
        level: Logging level (default INFO).

    Returns:
        Configured ``logging.Logger`` instance.
    """
    logger = logging.getLogger("linguist_guardian")
    logger.setLevel(level)

    # Avoid duplicate handlers on repeated calls
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d — %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


# Module-level singleton
logger = setup_logging()
