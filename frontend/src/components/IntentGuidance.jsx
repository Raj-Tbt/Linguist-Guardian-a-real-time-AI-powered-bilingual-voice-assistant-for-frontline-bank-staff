/**
 * IntentGuidance — Dynamic step-by-step guidance for staff.
 *
 * Displays detected customer intents in real time with:
 *   • Auto-detected intent badges
 *   • Step-by-step guidance for each intent
 *   • Collapsible sections for multiple intents
 *   • Step completion tracking (manual click-to-complete)
 */

import { useState } from 'react';

export default function IntentGuidance({ detectedIntents = [] }) {
  // Track completed steps per intent: { intent_key: Set<step_id> }
  const [completedSteps, setCompletedSteps] = useState({});

  const toggleStep = (intentKey, stepId) => {
    setCompletedSteps((prev) => {
      const steps = new Set(prev[intentKey] || []);
      if (steps.has(stepId)) {
        steps.delete(stepId);
      } else {
        steps.add(stepId);
      }
      return { ...prev, [intentKey]: steps };
    });
  };

  if (detectedIntents.length === 0) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          🎯 Smart Guidance
        </h3>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <span className="text-lg">💬</span>
          <span>Waiting for customer query — guidance will appear automatically.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        🎯 Smart Guidance
        <span className="badge-info text-[10px]">
          {detectedIntents.length} intent{detectedIntents.length > 1 ? 's' : ''} detected
        </span>
      </h3>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {detectedIntents.map((intent) => {
          const completed = completedSteps[intent.intent] || new Set();
          const totalSteps = intent.steps?.length || 0;
          const doneCount = completed.size;
          const progress = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

          return (
            <IntentSection
              key={intent.intent}
              intent={intent}
              completed={completed}
              doneCount={doneCount}
              totalSteps={totalSteps}
              progress={progress}
              onToggleStep={(stepId) => toggleStep(intent.intent, stepId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function IntentSection({ intent, completed, doneCount, totalSteps, progress, onToggleStep }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
      {/* Intent header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 p-3 hover:bg-white/5 transition-colors text-left"
      >
        <span className="text-lg">{intent.icon}</span>
        <span className="text-sm font-semibold text-white flex-1">{intent.label}</span>
        <span className="text-[10px] text-gray-500">
          via "{intent.matched_keyword}"
        </span>

        {/* Progress badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          progress === 100
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
        }`}>
          {doneCount}/{totalSteps}
        </span>

        <span className={`text-xs text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <div
          className={`h-full transition-all duration-500 ${
            progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps list */}
      {expanded && intent.steps && (
        <div className="p-2 space-y-1">
          {intent.steps.map((step, idx) => {
            const isDone = completed.has(step.id);

            return (
              <button
                key={step.id}
                onClick={() => onToggleStep(step.id)}
                className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-all ${
                  isDone
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                    : 'hover:bg-white/5'
                }`}
              >
                {/* Step number / checkmark */}
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 border ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-400 text-white'
                    : 'bg-white/5 border-white/20 text-gray-500'
                }`}>
                  {isDone ? '✓' : idx + 1}
                </div>

                {/* Step content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${
                    isDone ? 'text-emerald-400 line-through' : 'text-white'
                  }`}>
                    {step.label}
                  </p>
                  {!isDone && step.detail && (
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                      {step.detail}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
