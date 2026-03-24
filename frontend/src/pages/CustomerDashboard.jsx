/**
 * CustomerDashboard — Customer-facing dashboard page.
 *
 * Simpler layout than the staff dashboard:
 *   • Microphone input for voice
 *   • Text input for typing
 *   • Live chat display with translations
 *   • Process status indicator
 *
 * Designed for the customer sitting across the counter.
 */

import { useState, useCallback } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useAudioCapture from '../hooks/useAudioCapture';
import ChatPanel from '../components/ChatPanel';
import { createSession } from '../services/api';

export default function CustomerDashboard() {
  // ── State ──────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [currentIntent, setCurrentIntent] = useState(null);
  const [language, setLanguage] = useState('hi'); // Customer's preferred language

  // ── WebSocket handler ──────────────────────────────────────
  const handleWSMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'transcription':
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

      case 'translation':
        setCurrentIntent(msg.data.intent);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.findLastIndex((m) => m.role === 'customer');
          if (lastIdx >= 0) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              translated_text: msg.data.translated_text,
              intent: msg.data.intent,
            };
          }
          return updated;
        });
        break;

      case 'voice_response':
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'system',
            original_text: msg.data.text,
            language: msg.data.language,
            created_at: new Date().toISOString(),
          },
        ]);
        break;

      case 'fsm_update':
        // Could show process status to customer
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
  const { isConnected, sendMessage, sendAudio } = useWebSocket(sessionId, handleWSMessage);

  const handleAudioChunk = useCallback(
    (blob) => sendAudio(blob),
    [sendAudio]
  );

  const { isRecording, toggleRecording } = useAudioCapture(handleAudioChunk);

  // ── Handlers ───────────────────────────────────────────────
  const handleStart = async () => {
    try {
      const session = await createSession({
        customer_name: 'Customer',
        language,
      });
      setSessionId(session.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
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

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold gradient-text">
          🏦 Union Bank of India
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-Powered Bilingual Assistant — Customer View
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
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center glass-card p-12 max-w-md">
            <div className="text-6xl mb-4">🙏</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              नमस्ते! Welcome!
            </h2>
            <p className="text-gray-400 mb-6">
              Select your preferred language and start talking to our AI assistant.
            </p>

            {/* Language selector */}
            <div className="flex gap-2 justify-center mb-6">
              {[
                { code: 'hi', label: '🇮🇳 हिंदी' },
                { code: 'en', label: '🇬🇧 English' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    language === lang.code
                      ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <button onClick={handleStart} className="btn-primary text-lg px-8 py-3">
              🚀 Start Conversation
            </button>
          </div>
        </div>
      ) : (
        /* Chat interface */
        <div className="flex flex-col h-[calc(100vh-180px)]">
          <div className="flex-1 min-h-0 mb-4">
            <ChatPanel messages={messages} />
          </div>

          {/* Input area */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              {/* Large microphone button */}
              <button
                onClick={toggleRecording}
                className={`p-4 rounded-2xl transition-all ${
                  isRecording
                    ? 'bg-red-500 text-white recording-pulse scale-110'
                    : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30'
                }`}
                title={isRecording ? 'Stop recording' : 'Tap to speak'}
              >
                <span className="text-2xl">{isRecording ? '⏹️' : '🎙️'}</span>
              </button>

              {/* Text input */}
              <div className="flex-1 flex gap-2">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    language === 'hi'
                      ? 'अपना संदेश लिखें…'
                      : 'Type your message…'
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

            {isRecording && (
              <div className="mt-3 flex items-center justify-center gap-2 text-red-400 text-sm animate-pulse-soft">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Recording… Speak now
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
