/**
 * StaffDashboard — Staff-facing dashboard page.
 *
 * Layout:
 *   ┌──────────────┬────────────────┐
 *   │              │  Compliance    │
 *   │  Chat Panel  │  FSM Tracker   │
 *   │              │  Doc Verify    │
 *   │              │  Summary       │
 *   └──────────────┴────────────────┘
 *
 * Features:
 *   • Session creation — session ID shared with customer
 *   • Real-time chat with WebSocket
 *   • Text input + microphone capture
 *   • Compliance monitoring panel
 *   • FSM process tracker
 *   • Document verification
 *   • Session summary generation
 */

import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import useWebSocket from '../hooks/useWebSocket';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useTextToSpeech from '../hooks/useTextToSpeech';
import ChatPanel from '../components/ChatPanel';
import ComplianceAlerts from '../components/ComplianceAlerts';
import IntentGuidance from '../components/IntentGuidance';
import DocumentUpload from '../components/DocumentUpload';
import SessionSummary from '../components/SessionSummary';
import SentimentMeter from '../components/SentimentMeter';
import { createSession, endSession } from '../services/api';

export default function StaffDashboard() {
  // ── State ──────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(null);
  const [autoMic, setAutoMic] = useState(true); // Auto-mic ON by default
  const [messages, setMessages] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [detectedIntents, setDetectedIntents] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [stressScore, setStressScore] = useState(0);
  const [deEscalate, setDeEscalate] = useState(false);
  const [currentIntent, setCurrentIntent] = useState(null);

  // Refs for stable callback access inside useCallback
  const queueSpeakRef = useRef(null);
  const startListeningRef = useRef(null);
  const stopListeningRef = useRef(null);
  const autoMicRef = useRef(true);
  const isSpeakingRef = useRef(false);

  // ── WebSocket message handler ──────────────────────────────
  const handleWSMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'message': {
        // Only show messages from the OTHER party (customer)
        // Staff's own messages are already added locally in handleSendText
        if (msg.data.role === 'staff') break;

        // Customer message arrived — show it with translation
        // Swap: show English translation as primary, original Hindi as secondary
        setCurrentIntent(msg.data.intent);
        const msgId = Date.now();
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'customer',
            original_text: msg.data.translated_text,   // English translation as primary
            translated_text: msg.data.original_text,    // Original Hindi/regional as secondary
            intent: msg.data.intent,
            language: msg.data.source_language,
            created_at: new Date().toISOString(),
          },
        ]);

        // Auto-TTS: Read customer message aloud in English (translated)
        // Mic activation happens via onSpeechEndRef callback (after TTS finishes)
        if (queueSpeakRef.current) {
          const textToSpeak = msg.data.translated_text || msg.data.original_text;
          queueSpeakRef.current(textToSpeak, 'en', msgId);
        }
        break;
      }

      case 'compliance':
        if (!msg.data.is_compliant) {
          setAlerts((prev) => [...prev, ...msg.data.alerts]);
        }
        break;

      case 'sentiment':
        setStressScore(msg.data.stress_score);
        setDeEscalate(msg.data.de_escalate);
        break;

      case 'fsm_update':
        // Legacy — ignore
        break;

      case 'guidance_update':
        // Dynamic intent detection — merge new intents into existing
        if (msg.data.detected_intents) {
          setDetectedIntents((prev) => {
            const existingKeys = new Set(prev.map((i) => i.intent));
            const newIntents = msg.data.detected_intents.filter(
              (i) => !existingKeys.has(i.intent)
            );
            return [...prev, ...newIntents];
          });
        }
        break;

      case 'connected':
        console.log('Staff WS connected:', msg.data);
        break;

      case 'error':
        console.error('WS error:', msg.data.message);
        break;
    }
  }, []);

  // ── Hooks ──────────────────────────────────────────────────
  const { isConnected, sendMessage } = useWebSocket(sessionId, handleWSMessage);

  // Speech recognition — text goes into input field in English
  const handleSpeechResult = useCallback((text, isFinal) => {
    setTextInput(text);
  }, []);

  const { isListening, error: speechError, toggleListening, startListening, stopListening } = useSpeechRecognition(
    handleSpeechResult,
    'en',
  );

  // Text-to-speech — staff hears customer messages in English
  const { speak, stop: stopSpeaking, isSpeaking, autoPlay, setAutoPlay, queueSpeak, onSpeechEndRef } = useTextToSpeech('en');

  // Auto-activate mic precisely when TTS finishes playing
  onSpeechEndRef.current = () => {
    if (autoMic && !isListening) {
      startListening();
    }
  };

  // Keep refs in sync for stable callback access inside useCallback
  queueSpeakRef.current = queueSpeak;

  // ── Handlers ───────────────────────────────────────────────
  const handleCreateSession = async () => {
    try {
      // Clear ALL previous session state
      setMessages([]);
      setAlerts([]);
      setStressScore(0);
      setDeEscalate(false);
      setCurrentIntent(null);
      setDetectedIntents([]);
      setTextInput('');
      setCopiedId(false);

      const session = await createSession({
        staff_name: 'Staff Agent',
        language: 'en',
      });
      setSessionId(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleCopySessionId = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleSendText = () => {
    if (!textInput.trim() || !sessionId) return;
    sendMessage('text_input', {
      text: textInput.trim(),
      role: 'staff',
      language: 'en',
    });
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'staff',
        original_text: textInput.trim(),
        language: 'en',
        created_at: new Date().toISOString(),
      },
    ]);
    setTextInput('');

    // Auto-deactivate mic after sending
    if (isListening) {
      stopListening();
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    try {
      await endSession(sessionId);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
    // Reset ALL state back to welcome screen
    setSessionId(null);
    setMessages([]);
    setAlerts([]);
    setStressScore(0);
    setDeEscalate(false);
    setCurrentIntent(null);
    setDetectedIntents([]);
    setTextInput('');
    setCopiedId(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Top Navbar ── */}
      <nav className="bank-navbar">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏛️</span>
          <div>
            <h1>Linguist-Guardian</h1>
            <p className="subtitle">AI-Powered Multilingual Assistant - Staff Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Home button — only on welcome screen */}
          {!sessionId && (
            <Link to="/" className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white text-[11px] font-medium" title="Back to Home">
              ← Home
            </Link>
          )}
          {/* Connection status */}
          <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse-soft' : 'bg-red-400'
              }`}
            />
            <span className="text-[11px] text-white/80">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {currentIntent && (
            <span className="bg-white/10 text-white/90 text-[11px] px-2.5 py-1 rounded-lg font-medium">
              🎯 {currentIntent.replace(/_/g, ' ')}
            </span>
          )}

          {!sessionId ? (
            <button onClick={handleCreateSession} className="bg-white text-blue-700 text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
              + New Session
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopySessionId}
                className="bg-white/10 text-[11px] text-white/90 px-2.5 py-1 rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1"
                title="Click to copy session ID"
              >
                📋 {copiedId ? 'Copied!' : `${sessionId.slice(0, 8)}…`}
              </button>
              {/* Auto-Speech */}
              <button
                onClick={() => setAutoPlay(!autoPlay)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  autoPlay
                    ? 'bg-emerald-500/30 text-emerald-300'
                    : 'bg-white/10 text-white/50'
                }`}
                title={autoPlay ? 'Auto-speech ON' : 'Auto-speech OFF'}
              >
                {autoPlay ? '🔊' : '🔇'}
              </button>
              {/* Auto-Mic */}
              <button
                onClick={() => setAutoMic(!autoMic)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  autoMic
                    ? 'bg-sky-500/30 text-sky-300'
                    : 'bg-white/10 text-white/50'
                }`}
                title={autoMic ? 'Auto-mic ON' : 'Auto-mic OFF'}
              >
                {autoMic ? '🎙️' : '🎙️✗'}
              </button>
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/30 text-amber-300 hover:bg-amber-500/40 transition-all"
                >
                  ⏹
                </button>
              )}
              <button
                onClick={handleEndSession}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/30 text-red-300 hover:bg-red-500/40 transition-all"
              >
                ✕ End
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Session sharing banner ── */}
      {sessionId && isConnected && (
        <div className="mx-4 mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <span>✅</span>
            <span>Session active — Customer can join from their dashboard</span>
          </div>
          <button
            onClick={handleCopySessionId}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
          >
            {copiedId ? '✓ Copied' : '📋 Copy ID'}
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 p-4">
        {!sessionId ? (
          /* Welcome state */
          <div className="flex items-center justify-center" style={{ minHeight: '70vh' }}>
            <div className="text-center glass-card p-10 max-w-md">
              <div className="text-6xl mb-5">🏛️</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Welcome to Linguist-Guardian
              </h2>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Start a new session to begin assisting customers.<br/>
                They will be able to join your session automatically.
              </p>
              <button onClick={handleCreateSession} className="btn-primary">
                + Start New Session
              </button>
            </div>
          </div>
        ) : (
          /* Main layout — 2 columns */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 140px)' }}>
            {/* Left: Chat + Input */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex-1 min-h-0">
                <ChatPanel
                  messages={messages}
                  onSpeak={speak}
                  isSpeaking={isSpeaking}
                  onStopSpeaking={stopSpeaking}
                  speakLanguage="en"
                  dashboardRole="staff"
                />
              </div>

              {/* Input area */}
              <div className="glass-card p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleListening}
                    className={`p-2.5 rounded-lg transition-all ${
                      isListening
                        ? 'bg-red-600 text-white recording-pulse'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                    }`}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    {isListening ? '⏹️' : '🎙️'}
                  </button>

                  <input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? 'Listening… Speak now' : 'Type a message in English…'}
                    className="glass-input flex-1"
                  />

                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send ➤
                  </button>
                </div>

                {isListening && (
                  <div className="flex items-center justify-center gap-2 text-red-600 text-xs mt-2 animate-pulse-soft">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Listening… Speak now in English
                  </div>
                )}
                {speechError && (
                  <div className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-3 mt-2">
                    ⚠️ {speechError}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Panels */}
            <div className="space-y-3 overflow-y-auto">
              <SentimentMeter stressScore={stressScore} deEscalate={deEscalate} />
              <ComplianceAlerts alerts={alerts} />
              <IntentGuidance detectedIntents={detectedIntents} />
              <DocumentUpload />
              <SessionSummary sessionId={sessionId} messages={messages} alerts={alerts} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
