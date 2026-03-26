/**
 * Linguist-Guardian — Speech Recognition Hook.
 *
 * Uses the browser's native Web Speech API (SpeechRecognition)
 * for real-time speech-to-text conversion.
 *
 * Key features:
 *   • Real-time transcription — text appears as you speak
 *   • Multilingual support — all 8 Indian languages + English
 *   • Text goes into the INPUT FIELD (not as a chat message)
 *   • Proper permission handling + error states
 *   • No backend calls needed — works entirely in-browser
 */

import { useCallback, useRef, useState } from 'react';

// BCP-47 language codes for Web Speech API
const SPEECH_LANG_CODES = {
  hi: 'hi-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  en: 'en-IN',
};

/**
 * Hook for browser-native speech recognition.
 *
 * @param {function} onTranscript - Called with (text) when speech is recognized
 * @param {string} language - Language code ('hi', 'mr', 'en', etc.)
 * @returns {{ isListening, error, startListening, stopListening, toggleListening }}
 */
export default function useSpeechRecognition(onTranscript, language = 'en') {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  /** Start listening for speech */
  const startListening = useCallback(() => {
    setError(null);

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser. Use Chrome or Edge.');
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
    }

    const recognition = new SpeechRecognition();

    // Configuration
    recognition.lang = SPEECH_LANG_CODES[language] || SPEECH_LANG_CODES.en;
    recognition.continuous = true;        // Keep listening until stopped
    recognition.interimResults = true;     // Show partial results as user speaks
    recognition.maxAlternatives = 1;

    // When speech is recognized
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Send the text to the input field via callback
      const text = finalTranscript || interimTranscript;
      if (text && onTranscript) {
        onTranscript(text, event.results[event.results.length - 1].isFinal);
      }
    };

    recognition.onerror = (event) => {
      console.error('[SpeechRecognition] Error:', event.error);
      switch (event.error) {
        case 'not-allowed':
          setError('Microphone permission denied. Please allow microphone access.');
          break;
        case 'no-speech':
          setError('No speech detected. Please try again.');
          break;
        case 'audio-capture':
          setError('No microphone found. Please connect a microphone.');
          break;
        case 'network':
          setError('Network error. Please check your connection.');
          break;
        default:
          setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      // Only update state if we didn't manually stop
      if (recognitionRef.current) {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    // Start
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      console.log('[SpeechRecognition] Started — lang:', recognition.lang);
    } catch (err) {
      setError('Failed to start speech recognition.');
      console.error('[SpeechRecognition] Start failed:', err);
    }
  }, [language, onTranscript]);

  /** Stop listening */
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    console.log('[SpeechRecognition] Stopped');
  }, []);

  /** Toggle listening */
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
