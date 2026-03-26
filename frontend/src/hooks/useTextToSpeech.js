/**
 * Linguist-Guardian — Multilingual Text-to-Speech Hook.
 *
 * Two-tier TTS strategy for minimal latency:
 *   1. **Indian languages** → Sarvam AI TTS API via backend (real AI voice)
 *   2. **English** → Browser native SpeechSynthesis (instant, no API call)
 *
 * Supports: Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, English
 */

import { useCallback, useState, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api';

/**
 * Hook for multilingual text-to-speech.
 *
 * @param {string} defaultLanguage - Default language code ('hi', 'en', etc.)
 * @returns {{ speak, stop, isSpeaking }}
 */
export default function useTextToSpeech(defaultLanguage = 'en') {
  const [isSpeaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);
  const abortRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /**
   * Speak text in the given language.
   * Indian languages → Sarvam AI via backend
   * English → Browser SpeechSynthesis
   */
  const speak = useCallback(async (text, language) => {
    if (!text) return;

    // Stop any ongoing speech first
    stop();

    const lang = language || defaultLanguage;
    setSpeaking(true);

    try {
      if (lang === 'en') {
        // ── English: Browser SpeechSynthesis (instant) ──────
        _speakBrowser(text, lang);
      } else {
        // ── Indian languages: Sarvam AI TTS ─────────────────
        await _speakSarvam(text, lang);
      }
    } catch (err) {
      console.warn('TTS failed, falling back to browser:', err.message);
      // Fallback: try browser SpeechSynthesis for any language
      _speakBrowser(text, lang);
    }
  }, [defaultLanguage]);

  /** Speak via browser SpeechSynthesis */
  const _speakBrowser = (text, lang) => {
    if (!('speechSynthesis' in window)) {
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const langCodes = {
      hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN',
      bn: 'bn-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', en: 'en-IN',
    };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCodes[lang] || 'en-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === utterance.lang)
      || voices.find((v) => v.lang.startsWith(lang));
    if (voice) utterance.voice = voice;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  /** Speak via Sarvam AI TTS backend */
  const _speakSarvam = async (text, lang) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
      signal: controller.signal,
    });

    // If backend says "use browser" for English
    if (res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (data.use_browser) {
        _speakBrowser(text, lang);
        return;
      }
    }

    if (!res.ok) {
      throw new Error(`TTS API error: ${res.status}`);
    }

    // Play the WAV audio
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setSpeaking(false);
      URL.revokeObjectURL(audioUrl);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setSpeaking(false);
      URL.revokeObjectURL(audioUrl);
      audioRef.current = null;
    };

    await audio.play();
  };

  /** Stop all speech */
  const stop = useCallback(() => {
    // Stop browser speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // Stop Sarvam audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    // Abort pending fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking };
}
