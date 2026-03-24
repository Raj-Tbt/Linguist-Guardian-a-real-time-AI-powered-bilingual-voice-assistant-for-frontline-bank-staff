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
 *   • Session creation and selection
 *   • Real-time chat with WebSocket
 *   • Text input + microphone capture
 *   • Compliance monitoring panel
 *   • FSM process tracker
 *   • Document verification
 *   • Session summary generation
 */

import { useState, useCallback } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useAudioCapture from '../hooks/useAudioCapture';
import ChatPanel from '../components/ChatPanel';
import ComplianceAlerts from '../components/ComplianceAlerts';
import FSMTracker from '../components/FSMTracker';
import DocumentUpload from '../components/DocumentUpload';
import SessionSummary from '../components/SessionSummary';
import { createSession, advanceFSM, getFSMState } from '../services/api';

export default function StaffDashboard() {
  // ── State ──────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [fsmState, setFSMState] = useState({});
  const [textInput, setTextInput] = useState('');
  const [processType, setProcessType] = useState('account_opening');

  // ── WebSocket message handler ──────────────────────────────
  const handleWSMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'transcription':
        // STT result — add as a pending message with transcription
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
        // Update last customer message with translation + intent
        setMessages((prev) => {
          const updated = [...prev];
          const lastCustomerIdx = updated.findLastIndex((m) => m.role === 'customer');
          if (lastCustomerIdx >= 0) {
            updated[lastCustomerIdx] = {
              ...updated[lastCustomerIdx],
              translated_text: msg.data.translated_text,
              intent: msg.data.intent,
            };
          }
          return updated;
        });
        break;

      case 'compliance':
        if (!msg.data.is_compliant) {
          setAlerts((prev) => [...prev, ...msg.data.alerts]);
        }
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
  const { isConnected, sendMessage, sendAudio } = useWebSocket(sessionId, handleWSMessage);

  const handleAudioChunk = useCallback(
    (blob) => sendAudio(blob),
    [sendAudio]
  );

  const { isRecording, toggleRecording } = useAudioCapture(handleAudioChunk);

  // ── Handlers ───────────────────────────────────────────────
  const handleCreateSession = async () => {
    try {
      const session = await createSession({
        staff_name: 'Staff Agent',
        language: 'hi',
        process_type: processType,
      });
      setSessionId(session.id);
      setMessages([]);
      setAlerts([]);

      // Get initial FSM state
      const fsm = await getFSMState(session.id);
      setFSMState(fsm);
    } catch (err) {
      console.error('Failed to create session:', err);
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
              <span className="badge-info text-xs">
                Session: {sessionId.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
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
              Select a process type and create a new session to begin.
            </p>
            <button onClick={handleCreateSession} className="btn-primary">
              🚀 Start New Session
            </button>
          </div>
        </div>
      ) : (
        /* Main layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-160px)]">
          {/* Left column — Chat */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex-1 min-h-0">
              <ChatPanel messages={messages} />
            </div>

            {/* Input area */}
            <div className="glass-card p-3 flex items-center gap-3">
              {/* Microphone button */}
              <button
                onClick={toggleRecording}
                className={`p-3 rounded-xl transition-all ${
                  isRecording
                    ? 'bg-red-500 text-white recording-pulse'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                }`}
                title={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? '⏹️' : '🎙️'}
              </button>

              {/* Text input */}
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message (English or Hindi)…"
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
          </div>

          {/* Right column — Panels */}
          <div className="space-y-4 overflow-y-auto">
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
