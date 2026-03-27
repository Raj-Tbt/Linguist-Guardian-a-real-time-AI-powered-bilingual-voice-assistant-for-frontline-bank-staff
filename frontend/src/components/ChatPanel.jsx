/**
 * ChatPanel — Professional banking chat display.
 *
 * Renders a clean, readable conversation with:
 *   • Customer messages left-aligned (light green card)
 *   • Staff messages right-aligned (light blue card)
 *   • System messages center-aligned (light amber card)
 *   • Clean role badges, timestamps, TTS buttons
 *   • Smooth scroll to latest message
 */

import { useEffect, useRef } from 'react';

const ROLE_STYLES = {
  customer: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-600 text-white',
    label: 'Customer',
    align: 'mr-auto',
    textColor: 'text-gray-800',
  },
  staff: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-600 text-white',
    label: 'Staff',
    align: 'ml-auto',
    textColor: 'text-gray-800',
  },
  system: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-600 text-white',
    label: 'System',
    align: 'mx-auto',
    textColor: 'text-gray-700',
  },
};

/**
 * @param {object} props
 * @param {Array} props.messages - Chat messages
 * @param {Function} [props.onSpeak] - TTS callback: onSpeak(text, language)
 * @param {boolean} [props.isSpeaking] - Whether TTS is currently speaking
 * @param {Function} [props.onStopSpeaking] - Stop TTS callback
 * @param {string} [props.speakLanguage] - Language for TTS output
 * @param {string} [props.dashboardRole] - 'staff' or 'customer'
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="glass-card p-8 h-full flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-sm font-medium">No messages yet</p>
          <p className="text-xs text-gray-400 mt-1">Start a conversation to see messages here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Conversation
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((msg, idx) => {
          const style = ROLE_STYLES[msg.role] || ROLE_STYLES.system;

          let speakableText;
          let msgSpeakLang = speakLanguage;

          if (dashboardRole === 'staff' && msg.role === 'customer') {
            speakableText = msg.translated_text || msg.original_text || msg.text;
            msgSpeakLang = 'en';
          } else {
            speakableText = msg.original_text || msg.text || msg.translated_text;
          }

          return (
            <div
              key={msg.id || idx}
              className={`animate-slide-up max-w-[80%] ${style.align}`}
            >
              <div className={`${style.bg} border ${style.border} rounded-xl p-3.5`}>
                {/* Header: role badge + intent + TTS button */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`${style.badge} text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider`}>
                    {style.label}
                  </span>
                  {msg.intent && msg.intent !== 'general_query' && (
                    <span className="badge-info text-[10px]">
                      {msg.intent.replace(/_/g, ' ')}
                    </span>
                  )}

                  {/* TTS button */}
                  {onSpeak && speakableText && msg.role !== 'system' && (
                    <button
                      onClick={() => {
                        if (isSpeaking) {
                          onStopSpeaking?.();
                        } else {
                          onSpeak(speakableText, msgSpeakLang);
                        }
                      }}
                      className={`ml-auto p-1.5 rounded-lg text-xs transition-all ${
                        isSpeaking
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-blue-600'
                      }`}
                      title={isSpeaking ? 'Stop speaking' : 'Listen to this message'}
                    >
                      {isSpeaking ? '⏹' : '🔊'}
                    </button>
                  )}
                </div>

                {/* Primary text */}
                <p className={`text-sm leading-relaxed ${style.textColor}`}>
                  {msg.original_text || msg.text}
                </p>

                {/* Translation */}
                {msg.translated_text && (
                  <p className="text-gray-500 text-xs mt-2 italic border-t border-gray-200 pt-2">
                    🌐 {msg.translated_text}
                  </p>
                )}

                {/* Timestamp */}
                {msg.created_at && (
                  <p className="text-gray-400 text-[10px] mt-1.5 text-right">
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
