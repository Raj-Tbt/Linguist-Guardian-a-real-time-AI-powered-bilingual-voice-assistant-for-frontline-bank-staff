/**
 * ChatPanel — Bilingual chat display with TTS support.
 *
 * Renders a scrollable list of messages with:
 *   • Role badges (Customer / Staff / System)
 *   • Original text + translated text
 *   • 🔊 Speak buttons for TTS playback
 *   • Intent tags
 *   • Timestamps
 *   • Auto-scroll to latest message
 */

import { useEffect, useRef } from 'react';

const ROLE_STYLES = {
  customer: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    badge: 'badge-info',
    label: '🧑 Customer',
    align: 'mr-auto',
  },
  staff: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    badge: 'badge-success',
    label: '👨‍💼 Staff',
    align: 'ml-auto',
  },
  system: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    badge: 'badge-warning',
    label: '⚙️ System',
    align: 'mx-auto',
  },
};

/**
 * @param {object} props
 * @param {Array} props.messages - Chat messages
 * @param {Function} [props.onSpeak] - TTS callback: onSpeak(text, language)
 * @param {boolean} [props.isSpeaking] - Whether TTS is currently speaking
 * @param {Function} [props.onStopSpeaking] - Stop TTS callback
 * @param {string} [props.speakLanguage] - Language for TTS output
 * @param {string} [props.dashboardRole] - 'staff' or 'customer' — which dashboard this is on
 */
export default function ChatPanel({
  messages = [],
  onSpeak,
  isSpeaking,
  onStopSpeaking,
  speakLanguage,
  dashboardRole = 'staff',
}) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="glass-card p-6 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-sm">No messages yet. Start a conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Conversation
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((msg, idx) => {
          const style = ROLE_STYLES[msg.role] || ROLE_STYLES.system;

          // Pick the correct text for TTS based on who sent the message
          // and which dashboard we are on:
          //
          // Staff Dashboard (speakLanguage='en', dashboardRole='staff'):
          //   - Staff msg:    original_text is English    → speak original_text in 'en'
          //   - Customer msg: original_text is Hindi/etc  → speak translated_text in 'en'
          //
          // Customer Dashboard (speakLanguage='hi', dashboardRole='customer'):
          //   - Customer msg: original_text is Hindi      → speak original_text in 'hi'
          //   - Staff msg:    original_text is Hindi (swapped) → speak original_text in 'hi'
          let speakableText;
          let msgSpeakLang = speakLanguage;

          if (dashboardRole === 'staff' && msg.role === 'customer') {
            // Staff reading a customer message → speak the English translation
            speakableText = msg.translated_text || msg.original_text || msg.text;
            msgSpeakLang = 'en';
          } else {
            // All other cases → speak the primary display text (original_text)
            speakableText = msg.original_text || msg.text || msg.translated_text;
          }

          return (
            <div
              key={msg.id || idx}
              className={`animate-slide-up max-w-[85%] ${style.align}`}
            >
              <div className={`${style.bg} border ${style.border} rounded-xl p-3`}>
                {/* Header: role + intent + speak button */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={style.badge}>{style.label}</span>
                  {msg.intent && msg.intent !== 'general_query' && (
                    <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      {msg.intent.replace(/_/g, ' ')}
                    </span>
                  )}

                  {/* TTS Speak / Stop button */}
                  {onSpeak && speakableText && msg.role !== 'system' && (
                    <button
                      onClick={() => {
                        if (isSpeaking) {
                          onStopSpeaking?.();
                        } else {
                          onSpeak(speakableText, msgSpeakLang);
                        }
                      }}
                      className={`ml-auto p-1 rounded-md text-xs transition-all ${
                        isSpeaking
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-indigo-400'
                      }`}
                      title={isSpeaking ? 'Stop speaking' : 'Listen to this message'}
                    >
                      {isSpeaking ? '⏹' : '🔊'}
                    </button>
                  )}
                </div>

                {/* Original text */}
                <p className="text-white text-sm leading-relaxed">
                  {msg.original_text || msg.text}
                </p>

                {/* Translated text */}
                {msg.translated_text && (
                  <p className="text-gray-400 text-xs mt-1.5 italic border-t border-white/5 pt-1.5">
                    🌐 {msg.translated_text}
                  </p>
                )}

                {/* Timestamp */}
                {msg.created_at && (
                  <p className="text-gray-600 text-[10px] mt-1 text-right">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
