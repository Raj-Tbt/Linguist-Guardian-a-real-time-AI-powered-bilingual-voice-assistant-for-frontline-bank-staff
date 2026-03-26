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

import { useState, useCallback } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import ChatPanel from '../components/ChatPanel';
import ComplianceAlerts from '../components/ComplianceAlerts';
import FSMTracker from '../components/FSMTracker';
import DocumentUpload from '../components/DocumentUpload';
import SessionSummary from '../components/SessionSummary';
import SentimentMeter from '../components/SentimentMeter';
import { createSession, endSession, advanceFSM, getFSMState } from '../services/api';

export default function StaffDashboard() {
  // ── State ──────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [fsmState, setFSMState] = useState({});
  const [textInput, setTextInput] = useState('');
  const [processType, setProcessType] = useState('account_opening');
  const [copiedId, setCopiedId] = useState(false);
  const [stressScore, setStressScore] = useState(0);
  const [deEscalate, setDeEscalate] = useState(false);
  const [currentIntent, setCurrentIntent] = useState(null);

  // ── WebSocket message handler ──────────────────────────────
  const handleWSMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'message': {
        // Only show messages from the OTHER party (customer)
        // Staff's own messages are already added locally in handleSendText
        if (msg.data.role === 'staff') break;

        // Customer message arrived — show it with translation
        setCurrentIntent(msg.data.intent);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'customer',
            original_text: msg.data.original_text,
            translated_text: msg.data.translated_text,
            intent: msg.data.intent,
            language: msg.data.source_language,
            created_at: new Date().toISOString(),
          },
        ]);
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
        setFSMState(msg.data);
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

  const { isListening, error: speechError, toggleListening } = useSpeechRecognition(
    handleSpeechResult,
    'en',
  );

  // ── Handlers ───────────────────────────────────────────────
  const handleCreateSession = async () => {
    try {
      // Clear ALL previous session state (Fix #6)
      setMessages([]);
      setAlerts([]);
      setStressScore(0);
      setDeEscalate(false);
      setCurrentIntent(null);
      setFSMState({});
      setTextInput('');
      setCopiedId(false);

      const session = await createSession({
        staff_name: 'Staff Agent',
        language: 'en',
        process_type: processType,
      });
      setSessionId(session.id);

      // Get initial FSM state
      const fsm = await getFSMState(session.id);
      setFSMState(fsm);
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
    setFSMState({});
    setTextInput('');
    setCopiedId(false);
  };

  const handleAdvanceFSM = async (targetState) => {
    if (!sessionId) return;
    try {
      const result = await advanceFSM(sessionId, targetState);
      setFSMState(result);
    } catch (err) {
      console.error('FSM advance failed:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 lg:p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">
              Linguist-Guardian
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Staff Dashboard — AI Banking Assistant
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-pulse-soft' : 'bg-red-400'
                }`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Intent indicator */}
            {currentIntent && (
              <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs">
                🎯 {currentIntent.replace(/_/g, ' ')}
              </span>
            )}

            {/* Session controls */}
            {!sessionId ? (
              <div className="flex gap-2">
                <select
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value)}
                  className="glass-input text-sm py-2 w-44"
                >
                  <option value="account_opening">🏦 Account Opening</option>
                  <option value="loan_inquiry">💰 Loan Inquiry</option>
                </select>
                <button onClick={handleCreateSession} className="btn-primary text-sm">
                  + New Session
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySessionId}
                  className="badge-info text-xs cursor-pointer hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
                  title="Click to copy session ID"
                >
                  📋 {copiedId ? 'Copied!' : `Session: ${sessionId.slice(0, 8)}…`}
                </button>
                <button
                  onClick={handleEndSession}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
                >
                  ✕ End Session
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Session sharing banner */}
        {sessionId && isConnected && (
          <div className="mt-3 glass-card p-3 flex items-center justify-between bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-emerald-400">✅</span>
              <span className="text-gray-300">
                Session active — Customer can now join from their dashboard
              </span>
            </div>
            <button
              onClick={handleCopySessionId}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {copiedId ? '✓ Copied' : '📋 Copy ID'}
            </button>
          </div>
        )}
      </header>

      {!sessionId ? (
        /* Empty state */
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center glass-card p-12">
            <div className="text-6xl mb-4">🏛️</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Welcome to Linguist-Guardian
            </h2>
            <p className="text-gray-400 mb-6">
              Select a process type and create a new session to begin.<br/>
              The customer will be able to join your session automatically.
            </p>
            <button onClick={handleCreateSession} className="btn-primary">
              🚀 Start New Session
            </button>
          </div>
        </div>
      ) : (
        /* Main layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-200px)]">
          {/* Left column — Chat */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex-1 min-h-0">
              <ChatPanel messages={messages} />
            </div>

            {/* Input area */}
            <div className="glass-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {/* Microphone button */}
                <button
                  onClick={toggleListening}
                  className={`p-3 rounded-xl transition-all ${
                    isListening
                      ? 'bg-red-500 text-white recording-pulse'
                      : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? '⏹️' : '🎙️'}
                </button>

                {/* Text input */}
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? 'Listening… Speak now' : 'Type a message in English or tap 🎙️…'}
                  className="glass-input flex-1 text-sm"
                />

                <button
                  onClick={handleSendText}
                  disabled={!textInput.trim()}
                  className="btn-primary text-sm"
                >
                  Send ➤
                </button>
              </div>

              {isListening && (
                <div className="flex items-center justify-center gap-2 text-red-400 text-xs animate-pulse-soft">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Listening… Speak now in English
                </div>
              )}

              {speechError && (
                <div className="text-center text-xs text-amber-400 bg-amber-500/10 rounded-lg py-1.5 px-3">
                  ⚠️ {speechError}
                </div>
              )}
            </div>
          </div>

          {/* Right column — Panels */}
          <div className="space-y-4 overflow-y-auto">
            <SentimentMeter stressScore={stressScore} deEscalate={deEscalate} />
            <ComplianceAlerts alerts={alerts} />
            <FSMTracker
              processType={fsmState.process_type}
              currentState={fsmState.current_state}
              allSteps={fsmState.all_steps}
              completedSteps={fsmState.completed_steps}
              availableTransitions={fsmState.available_transitions}
              onAdvance={handleAdvanceFSM}
            />
            <DocumentUpload />
            <SessionSummary sessionId={sessionId} />
          </div>
        </div>
      )}
    </div>
  );
}
