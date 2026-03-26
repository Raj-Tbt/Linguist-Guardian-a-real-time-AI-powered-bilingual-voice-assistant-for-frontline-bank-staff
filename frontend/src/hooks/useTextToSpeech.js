/**
 * Linguist-Guardian — Multilingual Text-to-Speech Hook.
 *
 * Two-tier TTS strategy for minimal latency:
 *   1. **Indian languages** → Sarvam AI TTS API via backend (real AI voice)
 *   2. **English** → Browser native SpeechSynthesis (instant, no API call)
 *
 * Features:
 *   • Auto-play mode — automatically speaks incoming messages
 *   • Message queue — handles rapid incoming messages without overlap
 *   • Mute toggle — enable/disable auto-play
 *   • Deduplication — prevents replaying the same message
 *
 * Supports: Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, English
 */

import { useCallback, useState, useRef, useEffect } from 'react';

const API_BASE = '/api';

/**
 * Hook for multilingual text-to-speech with auto-play queue.
 *
 * @param {string} defaultLanguage - Default language code ('hi', 'en', etc.)
 * @returns {{ speak, stop, isSpeaking, autoPlay, setAutoPlay, queueSpeak }}
 */
export default function useTextToSpeech(defaultLanguage = 'en') {
  const [isSpeaking, setSpeaking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true); // Auto-play ON by default
  const audioRef = useRef(null);
  const abortRef = useRef(null);
  const queueRef = useRef([]);         // TTS message queue
  const processingRef = useRef(false); // Is the queue currently being processed?
  const spokenIdsRef = useRef(new Set()); // Track spoken message IDs to prevent duplicates
  const onSpeechEndRef = useRef(null); // Callback when all speech finishes

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
      queueRef.current = [];
      processingRef.current = false;
    };
  }, []);

  /** Speak via browser SpeechSynthesis */
  const _speakBrowser = useCallback((text, lang) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        setSpeaking(false);
        resolve();
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

      utterance.onend = () => { setSpeaking(false); resolve(); };
      utterance.onerror = () => { setSpeaking(false); resolve(); };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  /** Speak via Sarvam AI TTS backend */
  const _speakSarvam = useCallback(async (text, lang) => {
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
        await _speakBrowser(text, lang);
        return;
      }
    }

    if (!res.ok) {
      throw new Error(`TTS API error: ${res.status}`);
    }

    // Play the WAV audio
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        resolve();
      };

      audio.play().catch(() => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        resolve();
      });
    });
  }, [_speakBrowser]);

  /** Stop all speech */
  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Clear the queue when manually stopped
    queueRef.current = [];
    processingRef.current = false;
    setSpeaking(false);
  }, []);

  /**
   * Speak text in the given language (immediate, stops current speech).
   */
  const speak = useCallback(async (text, language) => {
    if (!text) return;
    stop();

    const lang = language || defaultLanguage;
    setSpeaking(true);

    try {
      if (lang === 'en') {
        await _speakBrowser(text, lang);
      } else {
        await _speakSarvam(text, lang);
      }
    } catch (err) {
      console.warn('TTS failed, falling back to browser:', err.message);
      await _speakBrowser(text, lang);
    }
  }, [defaultLanguage, stop, _speakBrowser, _speakSarvam]);

  /**
   * Process the TTS queue — plays messages one by one.
   */
  const _processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const { text, language: lang, id } = queueRef.current.shift();

      // Skip if already spoken (deduplication)
      if (id && spokenIdsRef.current.has(id)) continue;
      if (id) spokenIdsRef.current.add(id);

      // Keep spoken IDs set from growing unbounded
      if (spokenIdsRef.current.size > 100) {
        const arr = [...spokenIdsRef.current];
        spokenIdsRef.current = new Set(arr.slice(-50));
      }

      setSpeaking(true);
      try {
        const l = lang || defaultLanguage;
        if (l === 'en') {
          await _speakBrowser(text, l);
        } else {
          await _speakSarvam(text, l);
        }
      } catch (err) {
        console.warn('Auto-TTS failed, trying browser fallback:', err.message);
        try {
          await _speakBrowser(text, lang || defaultLanguage);
        } catch (_) { /* ignore */ }
      }
    }

    processingRef.current = false;
    setSpeaking(false);

    // Notify that all queued speech has finished
    if (onSpeechEndRef.current) {
      try { onSpeechEndRef.current(); } catch (_) { /* ignore */ }
    }
  }, [defaultLanguage, _speakBrowser, _speakSarvam]);

  /**
   * Queue a message for auto-play.
   * If auto-play is disabled, the message is silently skipped.
   *
   * @param {string} text - Text to speak
   * @param {string} [language] - Language code
   * @param {string|number} [id] - Unique message ID for deduplication
   */
  const queueSpeak = useCallback((text, language, id) => {
    if (!autoPlay || !text) return;

    // Skip if already spoken
    if (id && spokenIdsRef.current.has(id)) return;

    queueRef.current.push({ text, language: language || defaultLanguage, id });
    _processQueue();
  }, [autoPlay, defaultLanguage, _processQueue]);

  return { speak, stop, isSpeaking, autoPlay, setAutoPlay, queueSpeak, onSpeechEndRef };
}
