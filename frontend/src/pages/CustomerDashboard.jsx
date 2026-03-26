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

import { useState, useCallback, useEffect } from 'react';
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
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'staff',
            original_text: msg.data.translated_text, // show the translated version as primary
            translated_text: msg.data.original_text,  // show original English as secondary
            intent: msg.data.intent,
            language: msg.data.target_language,
            created_at: new Date().toISOString(),
          },
        ]);
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

  const { isListening, error: speechError, toggleListening } = useSpeechRecognition(
    handleSpeechResult,
    language,
  );

  // Text-to-speech — listen to staff responses in customer's language
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech(language);

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
    <div className="min-h-screen p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold gradient-text">
          🏦 Union Bank of India
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-Powered Multilingual Assistant — Customer View
        </p>

        {sessionId && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse-soft' : 'bg-red-400'
              }`}
            />
            <span className="text-xs text-gray-500">
              {isConnected ? 'Connected' : 'Connecting…'}
            </span>
            {selectedLang && (
              <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs">
                {selectedLang.flag} {selectedLang.name}
              </span>
            )}
            {currentIntent && (
              <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs">
                {currentIntent.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        )}
      </header>

      {!sessionId ? (
        /* Welcome screen */
        <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="text-center glass-card p-8 lg:p-12 max-w-lg w-full">
            <div className="text-6xl mb-4">🙏</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              नमस्ते! Welcome!
            </h2>
            <p className="text-gray-400 mb-6">
              Select your preferred language and join a session to talk to our bank staff.
            </p>

            {/* Language selector — 8 Indian languages + English */}
            <div className="mb-6">
              <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Your Language
              </label>
              <div className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      language === lang.code
                        ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer name input */}
            <div className="mb-6">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Your name (optional)"
                className="glass-input w-full text-center"
              />
            </div>

            {/* Active sessions list — show ONLY the latest */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Available Session
              </label>
              {loadingSessions ? (
                <div className="text-gray-500 text-sm py-4">Loading…</div>
              ) : activeSessions.length === 0 ? (
                <div className="text-gray-500 text-sm py-4 glass-card">
                  <div className="text-3xl mb-2">⏳</div>
                  No active sessions. Please wait for staff to create one.
                </div>
              ) : (
                <div>
                  {/* Show ONLY the first (latest) session */}
                  <button
                    onClick={() => handleJoinSession(activeSessions[0].id)}
                    className="w-full glass-card-hover p-4 text-left flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm text-white font-medium">
                        {activeSessions[0].staff_name || 'Staff'} — {(activeSessions[0].process_type || 'general').replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Tap to join this session
                      </div>
                    </div>
                    <span className="text-indigo-400 text-sm group-hover:translate-x-1 transition-transform">
                      Join →
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={fetchSessions}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      ) : (
        /* Chat interface */
        <div className="flex flex-col h-[calc(100vh-180px)]">
          {/* Chat header with End Conversation button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">💬 Active Conversation</span>
            </div>
            <button
              onClick={handleEndConversation}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
            >
              ✕ End Conversation
            </button>
          </div>

          <div className="flex-1 min-h-0 mb-4">
            <ChatPanel
              messages={messages}
              onSpeak={speak}
              isSpeaking={isSpeaking}
              onStopSpeaking={stopSpeaking}
              speakLanguage={language}
              dashboardRole="customer"
            />
          </div>

          {/* Input area */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              {/* Large microphone button */}
              <button
                onClick={toggleListening}
                className={`p-4 rounded-2xl transition-all ${
                  isListening
                    ? 'bg-red-500 text-white recording-pulse scale-110'
                    : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30'
                }`}
                title={isListening ? 'Stop listening' : 'Tap to speak'}
              >
                <span className="text-2xl">{isListening ? '⏹️' : '🎙️'}</span>
              </button>

              {/* Text input */}
              <div className="flex-1 flex gap-2">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isListening
                      ? `Listening in ${selectedLang?.name || 'your language'}…`
                      : selectedLang?.code === 'en'
                        ? 'Type or tap 🎙️ to speak…'
                        : `Type in ${selectedLang?.name || 'your language'} or tap 🎙️…`
                  }
                  className="glass-input flex-1"
                />
                <button
                  onClick={handleSendText}
                  disabled={!textInput.trim()}
                  className="btn-primary"
                >
                  ➤
                </button>
              </div>
            </div>

            {isListening && (
              <div className="mt-3 flex items-center justify-center gap-2 text-red-400 text-sm animate-pulse-soft">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Listening… Speak now in {selectedLang?.name || 'your language'}
              </div>
            )}

            {speechError && (
              <div className="mt-3 text-center text-xs text-amber-400 bg-amber-500/10 rounded-lg py-2 px-3">
                ⚠️ {speechError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
