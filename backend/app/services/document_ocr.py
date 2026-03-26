"""
Linguist-Guardian — Document OCR Extraction Service.

Uses GPT-4o Vision to extract fields from uploaded identity documents.
NO mock data — all extraction is performed on the actual uploaded image.

Supported document types:
  • Aadhaar Card  → name, aadhaar_number, dob
  • PAN Card      → name, pan_number, dob
"""

from __future__ import annotations

import base64
import json
import re
from typing import Optional

import openai

from app.core.config import settings
from app.core.logging import logger


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
    size_kb = len(image_bytes) / 1024
    if size_kb < 5:
        return {
            "error": "Image too small — may be corrupt or empty.",
            "quality": "rejected",
        }
    if size_kb > 10_000:
        return {
            "error": "Image too large — max 10 MB.",
            "quality": "rejected",
        }

    # ── Validate API key ──────────────────────────────────────
    if not settings.openai_enabled:
        return {
            "error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env to enable document extraction.",
            "quality": "rejected",
        }

    # ── GPT-4o Vision extraction ──────────────────────────────
    try:
        client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=60.0,  # 60s timeout for vision processing
        )

        # Determine MIME type from filename
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpeg"
        mime_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
        }
        mime = mime_map.get(ext, "image/jpeg")

        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        # Build document-type hint
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
            temperature=0.0,  # Deterministic — we want exact extraction
        )

        raw = response.choices[0].message.content.strip()

        # Parse JSON — handle possible markdown code blocks
        json_match = re.search(r"\{[^}]+\}", raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
        else:
            data = json.loads(raw)

        # Build validated result — only use what GPT extracted
        result = {
            "document_type": data.get("document_type", document_type or "aadhaar"),
            "extracted_name": data.get("extracted_name", ""),
            "extracted_number": data.get("extracted_number", ""),
            "extracted_dob": data.get("extracted_dob", ""),
            "confidence": float(data.get("confidence", 0.5)),
            "quality": data.get("quality", "fair"),
        }

        logger.info(
            "Document OCR [GPT-4o]: name='%s' number='%s' dob='%s' quality=%s confidence=%.2f",
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

    except openai.RateLimitError:
        logger.error("OpenAI rate limit reached")
        return {
            "error": "OpenAI rate limit reached. Please try again in a moment.",
            "quality": "rejected",
        }

    except openai.BadRequestError as exc:
        logger.error("OpenAI bad request: %s", exc)
        return {
            "error": f"Could not process image: {exc}",
            "quality": "rejected",
        }

    except json.JSONDecodeError:
        logger.error("GPT-4o returned non-JSON response: %s", raw[:200])
        return {
            "error": "AI could not parse the document. Please upload a clearer image.",
            "quality": "poor",
        }

    except openai.APITimeoutError:
        logger.error("OpenAI GPT-4o Vision request timed out (60s)")
        return {
            "error": "Document extraction timed out. The image may be too large or the server is busy. Please try again.",
            "quality": "rejected",
        }

    except Exception as exc:
        logger.error("Document OCR failed: %s", exc)
        return {
            "error": f"Extraction failed: {str(exc)}",
            "quality": "rejected",
        }
