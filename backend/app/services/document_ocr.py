"""
Linguist-Guardian — Document OCR Extraction Service.

Uses GPT-4o Vision to extract fields from uploaded identity documents.
NO mock data — all extraction is performed on the actual uploaded image.

Features:
  • Automatic retry (up to 2 retries) on transient failures
  • Image pre-validation (size, format)
  • Robust JSON parsing from GPT response
  • Detailed error messages for each failure mode

Supported document types:
  • Aadhaar Card  → name, aadhaar_number, dob
  • PAN Card      → name, pan_number, dob
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Optional

import openai

from app.core.config import settings
from app.core.logging import logger

# Maximum retries for transient API failures
MAX_RETRIES = 2
RETRY_DELAY_SECONDS = 2


def _detect_mime(filename: str, image_bytes: bytes) -> str:
    """Detect MIME type from filename extension or magic bytes."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "bmp": "image/bmp",
    }
    if ext in mime_map:
        return mime_map[ext]

    # Fallback: detect from magic bytes
    if image_bytes[:3] == b'\xff\xd8\xff':
        return "image/jpeg"
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return "image/webp"

    return "image/jpeg"  # Safe default


def _parse_json_from_response(raw: str) -> dict:
    """
    Robustly parse JSON from GPT response.
    Handles responses wrapped in markdown code blocks.
    """
    # Strip markdown code block wrappers
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove ```json or ``` prefix and trailing ```
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)

    # Try direct JSON parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in the response
    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("No valid JSON found in response", cleaned, 0)


async def extract_document_data(
    image_bytes: bytes,
    filename: str = "document.jpg",
    document_type: Optional[str] = None,
) -> dict:
    """
    Extract identity document fields from an uploaded image using GPT-4o Vision.

    Args:
        image_bytes: Raw image bytes (JPEG/PNG/WebP).
        filename: Original filename.
        document_type: Optional hint — 'aadhaar' or 'pan'.

    Returns:
        dict with keys:
            document_type, extracted_name, extracted_number,
            extracted_dob, confidence, quality
    """
    # ── Validate image ────────────────────────────────────────
    if not image_bytes or len(image_bytes) == 0:
        return {
            "error": "No image data received. Please upload a valid file.",
            "quality": "rejected",
        }

    size_kb = len(image_bytes) / 1024
    if size_kb < 2:
        return {
            "error": "Image too small — may be corrupt or empty.",
            "quality": "rejected",
        }
    if size_kb > 20_000:
        return {
            "error": "Image too large — max 20 MB. Please compress or resize.",
            "quality": "rejected",
        }

    # ── Validate API key ──────────────────────────────────────
    if not settings.openai_enabled:
        return {
            "error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env to enable document extraction.",
            "quality": "rejected",
        }

    # ── Detect MIME type ──────────────────────────────────────
    mime = _detect_mime(filename, image_bytes)
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    # ── Build prompt ──────────────────────────────────────────
    doc_hint = ""
    if document_type == "aadhaar":
        doc_hint = "This is an Indian Aadhaar card. Look for the 12-digit Aadhaar number."
    elif document_type == "pan":
        doc_hint = "This is an Indian PAN card. Look for the 10-character PAN number (format: ABCDE1234F)."

    prompt = f"""You are an expert identity-document data extractor for Union Bank of India.
Carefully analyze the uploaded document image and extract EXACTLY the data printed on it.

Extract these fields:
1. **Full name** — as printed on the document (exact spelling)
2. **Document number** — Aadhaar (12 digits) or PAN (10 alphanumeric characters)
3. **Date of birth** — convert to DD/MM/YYYY format
4. **Document type** — 'aadhaar' or 'pan'
5. **Image quality** — 'good' (clear text), 'fair' (readable but imperfect), or 'poor' (hard to read)

{doc_hint}

RULES:
- Extract ONLY what is visible on the document. Do NOT invent or assume any data.
- If a field is unreadable or missing, set it to an empty string "".
- The confidence score (0.0 to 1.0) should reflect how certain you are about the extraction accuracy.
- For poor quality images, set confidence below 0.5.

Return ONLY valid JSON — no markdown, no explanation, no code blocks:
{{
  "document_type": "aadhaar",
  "extracted_name": "Full Name Here",
  "extracted_number": "123456789012",
  "extracted_dob": "DD/MM/YYYY",
  "confidence": 0.95,
  "quality": "good"
}}"""

    # ── GPT-4o Vision extraction with retry ───────────────────
    last_error = None

    for attempt in range(1, MAX_RETRIES + 2):  # 1, 2, 3 (initial + 2 retries)
        try:
            logger.info(
                "Document OCR attempt %d/%d: file=%s type=%s size=%.1fKB",
                attempt, MAX_RETRIES + 1, filename, document_type, size_kb,
            )

            client = openai.AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=90.0,  # 90s timeout for vision processing
            )

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime};base64,{image_b64}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                max_tokens=500,
                temperature=0.0,
            )

            raw = response.choices[0].message.content.strip()
            data = _parse_json_from_response(raw)

            # Build validated result
            result = {
                "document_type": data.get("document_type", document_type or "aadhaar"),
                "extracted_name": data.get("extracted_name", ""),
                "extracted_number": data.get("extracted_number", ""),
                "extracted_dob": data.get("extracted_dob", ""),
                "confidence": float(data.get("confidence", 0.5)),
                "quality": data.get("quality", "fair"),
            }

            logger.info(
                "Document OCR SUCCESS: name='%s' number='%s' dob='%s' quality=%s confidence=%.2f",
                result["extracted_name"],
                result["extracted_number"],
                result["extracted_dob"],
                result["quality"],
                result["confidence"],
            )

            return result

        except openai.AuthenticationError:
            logger.error("OpenAI authentication failed — invalid API key")
            return {
                "error": "OpenAI API key is invalid. Please update OPENAI_API_KEY in .env.",
                "quality": "rejected",
            }

        except openai.RateLimitError as exc:
            error_str = str(exc).lower()
            # Distinguish between temporary rate limit and billing quota exhaustion
            if "insufficient_quota" in error_str or "quota" in error_str:
                logger.error("OpenAI quota exhausted — no credits remaining")
                return {
                    "error": "OpenAI API quota exhausted — your account has no credits. Please add billing credits at platform.openai.com and try again.",
                    "quality": "rejected",
                }
            last_error = "Rate limit reached"
            logger.warning("OpenAI rate limit (attempt %d) — retrying...", attempt)
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS * attempt)
                continue
            return {
                "error": "OpenAI rate limit reached. Please try again in a moment.",
                "quality": "rejected",
            }

        except openai.APITimeoutError:
            last_error = "Request timed out"
            logger.warning("OpenAI timeout (attempt %d) — retrying...", attempt)
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            return {
                "error": "Document extraction timed out after multiple attempts. Please try a smaller/clearer image.",
                "quality": "rejected",
            }

        except openai.BadRequestError as exc:
            error_msg = str(exc)
            logger.error("OpenAI bad request: %s", error_msg)

            # Check for common issues
            if "image" in error_msg.lower() or "content" in error_msg.lower():
                return {
                    "error": "The uploaded file could not be read as an image. Please upload a clear JPEG, PNG, or WebP file.",
                    "quality": "rejected",
                }
            return {
                "error": f"Could not process document: {error_msg}",
                "quality": "rejected",
            }

        except json.JSONDecodeError:
            last_error = "AI returned unparseable response"
            logger.warning("GPT-4o returned non-JSON (attempt %d) — retrying...", attempt)
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            return {
                "error": "AI could not parse the document text. Please upload a clearer image.",
                "quality": "poor",
            }

        except openai.APIConnectionError as exc:
            last_error = f"Connection error: {exc}"
            logger.warning("OpenAI connection error (attempt %d): %s", attempt, exc)
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            return {
                "error": "Could not connect to OpenAI. Please check your internet connection and try again.",
                "quality": "rejected",
            }

        except Exception as exc:
            last_error = str(exc)
            logger.error("Document OCR failed (attempt %d): %s", attempt, exc)
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                continue
            return {
                "error": f"Extraction failed after {MAX_RETRIES + 1} attempts: {last_error}",
                "quality": "rejected",
            }

    # Should not reach here, but just in case
    return {
        "error": f"Extraction failed: {last_error}",
        "quality": "rejected",
    }
