/**
 * CustomerDashboard — Customer-facing dashboard page.
 *
 * Flow:
 *   1. Customer selects preferred language (8 Indian + English)
 *   2. Customer sees active sessions created by staff and joins one
 *   3. WebSocket connects using the shared session ID
 *   4. Customer sends messages in their language → staff sees English translation
 *
 * Designed for the customer sitting across the counter.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useTextToSpeech from '../hooks/useTextToSpeech';
import ChatPanel from '../components/ChatPanel';
import { listActiveSessions, joinSession } from '../services/api';

const LANGUAGES = [
  { code: 'hi', label: 'हिंदी', flag: '🇮🇳', name: 'Hindi' },
  { code: 'mr', label: 'मराठी', flag: '🇮🇳', name: 'Marathi' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳', name: 'Tamil' },
  { code: 'te', label: 'తెలుగు', flag: '🇮🇳', name: 'Telugu' },
  { code: 'bn', label: 'বাংলা', flag: '🇮🇳', name: 'Bengali' },
  { code: 'gu', label: 'ગુજરાતી', flag: '🇮🇳', name: 'Gujarati' },
  { code: 'kn', label: 'ಕನ್ನಡ', flag: '🇮🇳', name: 'Kannada' },
  { code: 'ml', label: 'മലയാളം', flag: '🇮🇳', name: 'Malayalam' },
  { code: 'en', label: 'English', flag: '🇬🇧', name: 'English' },
];

export default function CustomerDashboard() {
  // ── State ──────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [currentIntent, setCurrentIntent] = useState(null);
  const [language, setLanguage] = useState('hi');
  const [activeSessions, setActiveSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [autoMic, setAutoMic] = useState(true); // Auto-mic ON by default

  // Refs for stable callback access inside useCallback
  const queueSpeakRef = useRef(null);
  const startListeningRef = useRef(null);
  const stopListeningRef = useRef(null);
  const autoMicRef = useRef(true);
  const isSpeakingRef = useRef(false);

  // ── Load active sessions ───────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const sessions = await listActiveSessions();
      setActiveSessions(sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      fetchSessions();
      const interval = setInterval(fetchSessions, 5000); // Poll every 5s
      return () => clearInterval(interval);
    }
  }, [sessionId, fetchSessions]);

  // ── WebSocket handler ──────────────────────────────────────
  const handleWSMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'transcription':
        // Audio was captured by mic → STT result → show as customer's own message
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'customer',
            original_text: msg.data.text,
            language: msg.data.language,
            created_at: new Date().toISOString(),
          },
        ]);
        break;

      case 'message': {
        // Only show messages from the OTHER party (staff)
        // Customer's own messages are already added locally in handleSendText
        if (msg.data.role === 'customer') break;

        // Staff reply arrived — show it with translation to customer's language
        setCurrentIntent(msg.data.intent);
        const msgId = Date.now();
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'staff',
            original_text: msg.data.translated_text, // show the translated version as primary
            translated_text: msg.data.original_text,  // show original English as secondary
            intent: msg.data.intent,
            language: msg.data.target_language,
            created_at: new Date().toISOString(),
          },
        ]);

        // Auto-TTS: Read staff message aloud in customer's selected language
        // Mic activation happens via onSpeechEndRef callback (after TTS finishes)
        if (queueSpeakRef.current) {
          const textToSpeak = msg.data.translated_text || msg.data.original_text;
          const spokenLang = msg.data.target_language || 'en';
          queueSpeakRef.current(textToSpeak, spokenLang, msgId);
        }
        break;
      }

      case 'fsm_update':
        break;

      case 'connected':
        console.log('Customer WS connected');
        break;

      case 'error':
        console.error('Customer WS error:', msg.data.message);
        break;
    }
  }, []);

  // ── Hooks ──────────────────────────────────────────────────
  const { isConnected, sendMessage } = useWebSocket(sessionId, handleWSMessage);

  // Speech recognition — text goes into input field in customer's language
  const handleSpeechResult = useCallback((text, isFinal) => {
    setTextInput(text);
  }, []);

  const { isListening, error: speechError, toggleListening, startListening, stopListening } = useSpeechRecognition(
    handleSpeechResult,
    language,
  );

  // Text-to-speech — listen to staff responses in customer's language
  const { speak, stop: stopSpeaking, isSpeaking, autoPlay, setAutoPlay, queueSpeak, onSpeechEndRef } = useTextToSpeech(language);

  // Auto-activate mic precisely when TTS finishes playing
  onSpeechEndRef.current = () => {
    if (autoMic && !isListening) {
      startListening();
    }
  };

  // Keep ref in sync for stable callback access inside useCallback
  queueSpeakRef.current = queueSpeak;

  // ── Handlers ───────────────────────────────────────────────
  const handleJoinSession = async (sid) => {
    try {
      await joinSession(sid, {
        customer_name: customerName || 'Customer',
        language,
      });
      setSessionId(sid);
      setMessages([]);
      setCurrentIntent(null);
    } catch (err) {
      console.error('Failed to join session:', err);
    }
  };

  /** End Conversation — clears chat, returns to welcome screen */
  const handleEndConversation = () => {
    setSessionId(null);
    setMessages([]);
    setTextInput('');
    setCurrentIntent(null);
  };

  const handleSendText = () => {
    if (!textInput.trim() || !sessionId) return;
    sendMessage('text_input', {
      text: textInput.trim(),
      role: 'customer',
      language,
    });
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'customer',
        original_text: textInput.trim(),
        language,
        created_at: new Date().toISOString(),
      },
    ]);
    setTextInput('');

    // Auto-deactivate mic after sending
    if (isListening) {
      stopListening();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const selectedLang = LANGUAGES.find((l) => l.code === language);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Top Navbar ── */}
      <nav className="bank-navbar">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏦</span>
          <div>
            <h1>Union Bank of India</h1>
            <p className="subtitle">AI-Powered Multilingual Assistant</p>
          </div>
        </div>

        {sessionId && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse-soft' : 'bg-red-400'}`} />
              <span className="text-[11px] text-white/80">{isConnected ? 'Connected' : 'Connecting…'}</span>
            </div>
            {selectedLang && (
              <span className="bg-white/10 text-white/90 text-[11px] px-2.5 py-1 rounded-lg font-medium">{selectedLang.flag} {selectedLang.name}</span>
            )}
            {currentIntent && (
              <span className="bg-white/10 text-white/90 text-[11px] px-2.5 py-1 rounded-lg font-medium">{currentIntent.replace(/_/g, ' ')}</span>
            )}
            <button onClick={() => setAutoPlay(!autoPlay)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${autoPlay ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-white/50'}`} title={autoPlay ? 'Auto-speech ON' : 'Auto-speech OFF'}>{autoPlay ? '🔊' : '🔇'}</button>
            <button onClick={() => setAutoMic(!autoMic)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${autoMic ? 'bg-sky-500/30 text-sky-300' : 'bg-white/10 text-white/50'}`} title={autoMic ? 'Auto-mic ON' : 'Auto-mic OFF'}>{autoMic ? '🎙️' : '🎙️✗'}</button>
            {isSpeaking && (
              <button onClick={stopSpeaking} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/30 text-amber-300 transition-all">⏹</button>
            )}
          </div>
        )}
      </nav>

      {/* ── Main Content ── */}
      <div className="flex-1 p-4 max-w-3xl mx-auto w-full">
        {!sessionId ? (
          <div className="flex items-center justify-center" style={{ minHeight: '75vh' }}>
            <div className="text-center glass-card p-8 lg:p-10 max-w-lg w-full">
              <div className="text-5xl mb-4">🙏</div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">नमस्ते! Welcome!</h2>
              <p className="text-gray-500 text-sm mb-6">Select your preferred language and join a session to talk to our bank staff.</p>

              <div className="mb-5">
                <label className="block text-[11px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Your Language</label>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGES.map((lang) => (
                    <button key={lang.code} onClick={() => setLanguage(lang.code)} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${language === lang.code ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name (optional)" className="glass-input w-full text-center" />
              </div>

              <div className="mb-4">
                <label className="block text-[11px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Available Session</label>
                {loadingSessions ? (
                  <div className="text-gray-400 text-sm py-4">Loading…</div>
                ) : activeSessions.length === 0 ? (
                  <div className="text-gray-500 text-sm py-4 glass-card p-4">
                    <div className="text-3xl mb-2">⏳</div>
                    No active sessions. Please wait for staff to create one.
                  </div>
                ) : (
                  <button onClick={() => handleJoinSession(activeSessions[0].id)} className="w-full glass-card-hover p-4 text-left flex items-center justify-between group">
                    <div>
                      <div className="text-sm text-gray-800 font-medium">{activeSessions[0].staff_name || 'Staff'} — {(activeSessions[0].process_type || 'general').replace(/_/g, ' ')}</div>
                      <div className="text-xs text-gray-400 mt-1">Tap to join this session</div>
                    </div>
                    <span className="text-blue-600 text-sm font-semibold group-hover:translate-x-1 transition-transform">Join →</span>
                  </button>
                )}
              </div>

              <button onClick={fetchSessions} className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">🔄 Refresh</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600 font-medium">💬 Active Conversation</span>
              <button onClick={handleEndConversation} className="btn-danger text-xs">✕ End Conversation</button>
            </div>

            <div className="flex-1 min-h-0 mb-3">
              <ChatPanel messages={messages} onSpeak={speak} isSpeaking={isSpeaking} onStopSpeaking={stopSpeaking} speakLanguage={language} dashboardRole="customer" />
            </div>

            <div className="glass-card p-3">
              <div className="flex items-center gap-2">
                <button onClick={toggleListening} className={`p-3 rounded-lg transition-all ${isListening ? 'bg-red-600 text-white recording-pulse' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}`} title={isListening ? 'Stop listening' : 'Tap to speak'}>
                  <span className="text-xl">{isListening ? '⏹️' : '🎙️'}</span>
                </button>
                <input value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={isListening ? `Listening in ${selectedLang?.name || 'your language'}…` : selectedLang?.code === 'en' ? 'Type or tap 🎙️ to speak…' : `Type in ${selectedLang?.name || 'your language'} or tap 🎙️…`} className="glass-input flex-1" />
                <button onClick={handleSendText} disabled={!textInput.trim()} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">➤</button>
              </div>
              {isListening && (
                <div className="mt-2 flex items-center justify-center gap-2 text-red-600 text-xs animate-pulse-soft">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Listening… Speak now in {selectedLang?.name || 'your language'}
                </div>
              )}
              {speechError && (
                <div className="mt-2 text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">⚠️ {speechError}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

