/**
 * SessionSummary — Bilingual summary display.
 *
 * Shows the TextRank-generated summary in both English and Hindi,
 * with a "Generate Summary" button.
 */

import { useState } from 'react';
import { generateSummary } from '../services/api';

export default function SessionSummary({ sessionId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await generateSummary(sessionId);
      setSummary(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          📝 Session Summary
        </h3>
        <button
          onClick={handleGenerate}
          disabled={loading || !sessionId}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {loading ? '⏳ Generating...' : '✨ Generate'}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-2">{error}</p>
      )}

      {summary ? (
        <div className="space-y-3 animate-slide-up">
          {/* English summary */}
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="badge-info">🇬🇧 English</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {summary.summary_en}
            </p>
          </div>

          {/* Hindi summary */}
          {summary.summary_hi && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-warning">🇮🇳 हिंदी</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {summary.summary_hi}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Click "Generate" to create a bilingual summary of this session.
        </p>
      )}
    </div>
  );
}
