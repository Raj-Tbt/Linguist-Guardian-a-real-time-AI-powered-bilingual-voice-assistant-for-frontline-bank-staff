"""
Linguist-Guardian — Sentiment & Stress Analyzer (Algo #2).

Analyses audio to detect customer stress using two techniques:
  • **MFCC** — 13 Mel-Frequency Cepstral Coefficients capturing vocal
    timbre / tonal shape.
  • **YIN** — autocorrelation-based pitch (F0) detection revealing
    pitch variability under stress.

The stress_score (0.0–1.0) feeds:
  1. The urgency scoring formula (queue_manager)
  2. The TTS voice profile selector (calm vs normal)
  3. The staff dashboard sentiment meter

When librosa is not installed, the module degrades gracefully
to a mock mode that returns simulated scores.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from app.core.logging import logger


# ── Constants ─────────────────────────────────────────────────
_SAMPLE_RATE = 16_000          # 16 kHz mono PCM
_N_MFCC = 13                   # standard MFCC count
_PITCH_STD_NORM = 80.0         # normaliser for pitch std deviation
_ZCR_NORM = 0.10               # normaliser for zero-crossing rate
_STRESS_THRESHOLD = 0.65       # above this → de-escalate flag
_PITCH_WEIGHT = 0.6
_ZCR_WEIGHT = 0.4


# ── Mock state ────────────────────────────────────────────────
_mock_counter = 0
_MOCK_SCORES = [0.15, 0.22, 0.38, 0.42, 0.55, 0.68, 0.72, 0.30, 0.18, 0.45]


async def analyse_audio(
    audio_bytes: bytes,
    sample_rate: int = _SAMPLE_RATE,
) -> dict:
    """
    Analyse an audio chunk for vocal stress indicators.

    Args:
        audio_bytes: Raw PCM-16 audio data (mono, 16 kHz).
        sample_rate: Sample rate of the audio.

    Returns:
        dict with keys:
          - stress_score (float 0.0–1.0)
          - de_escalate  (bool)
          - pitch_mean   (float Hz)
          - pitch_std    (float Hz)
          - zcr          (float)
          - mfcc_mean    (list[float] — 13 values)
    """
    try:
        return _analyse_with_librosa(audio_bytes, sample_rate)
    except ImportError:
        logger.info("librosa not available — using mock sentiment.")
        return _analyse_mock()
    except Exception as exc:
        logger.warning("Sentiment analysis failed (%s) — using mock.", exc)
        return _analyse_mock()


# ── Real analysis (Algo #2) ──────────────────────────────────

def _analyse_with_librosa(
    audio_bytes: bytes,
    sample_rate: int,
) -> dict:
    """
    Real MFCC + YIN analysis using librosa.

    Steps:
      1. Decode raw PCM bytes → float32 waveform
      2. Extract 13 MFCCs (timbral shape)
      3. YIN pitch detection → F0 track
      4. Compute zero-crossing rate
      5. Combine into stress_score
    """
    import librosa  # lazy import — not always installed

    # Decode PCM-16 LE bytes → float32 [-1, 1]
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    waveform = audio_int16.astype(np.float32) / 32768.0

    if len(waveform) < sample_rate * 0.1:  # less than 100ms
        return _analyse_mock()

    # ── Step 1: MFCC extraction ────────────────────────────
    mfccs = librosa.feature.mfcc(
        y=waveform,
        sr=sample_rate,
        n_mfcc=_N_MFCC,
    )
    mfcc_mean = mfccs.mean(axis=1).tolist()

    # ── Step 2: YIN pitch detection ────────────────────────
    f0 = librosa.yin(
        y=waveform,
        fmin=librosa.note_to_hz("C2"),   # ~65 Hz
        fmax=librosa.note_to_hz("C6"),   # ~1047 Hz
        sr=sample_rate,
    )
    # Filter unvoiced frames (YIN returns fmax for unvoiced)
    voiced_f0 = f0[f0 < librosa.note_to_hz("C6") * 0.95]

    if len(voiced_f0) > 0:
        pitch_mean = float(np.mean(voiced_f0))
        pitch_std = float(np.std(voiced_f0))
    else:
        pitch_mean = 0.0
        pitch_std = 0.0

    # ── Step 3: Zero-crossing rate ─────────────────────────
    zcr_frames = librosa.feature.zero_crossing_rate(waveform)
    zcr = float(np.mean(zcr_frames))

    # ── Step 4: Stress formula ─────────────────────────────
    # Stress = min(1.0, (pitch_std/80)*0.6 + (zcr/0.1)*0.4)
    stress_score = min(
        1.0,
        (pitch_std / _PITCH_STD_NORM) * _PITCH_WEIGHT
        + (zcr / _ZCR_NORM) * _ZCR_WEIGHT,
    )
    stress_score = round(stress_score, 3)
    de_escalate = stress_score > _STRESS_THRESHOLD

    logger.info(
        "Sentiment: stress=%.3f de_escalate=%s pitch_mean=%.1f pitch_std=%.1f zcr=%.4f",
        stress_score, de_escalate, pitch_mean, pitch_std, zcr,
    )

    return {
        "stress_score": stress_score,
        "de_escalate": de_escalate,
        "pitch_mean": round(pitch_mean, 2),
        "pitch_std": round(pitch_std, 2),
        "zcr": round(zcr, 5),
        "mfcc_mean": [round(v, 4) for v in mfcc_mean],
    }


# ── Mock analysis ────────────────────────────────────────────

def _analyse_mock() -> dict:
    """Return a simulated stress score for development."""
    global _mock_counter
    score = _MOCK_SCORES[_mock_counter % len(_MOCK_SCORES)]
    _mock_counter += 1

    return {
        "stress_score": score,
        "de_escalate": score > _STRESS_THRESHOLD,
        "pitch_mean": 180.0 + score * 120,
        "pitch_std": 10.0 + score * 70,
        "zcr": 0.02 + score * 0.08,
        "mfcc_mean": [0.0] * _N_MFCC,
    }
