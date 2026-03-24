/**
 * FSMTracker — Visual process step tracker.
 *
 * Displays the finite state machine progress as a
 * vertical timeline with:
 *   • Completed steps (green checkmark)
 *   • Current step (pulsing indicator)
 *   • Upcoming steps (muted)
 *   • "Advance" button for the next step
 */

const STATE_LABELS = {
  idle: 'Not Started',
  form_filling: 'Filling Application Form',
  kyc_submission: 'KYC Submission',
  document_verification: 'Document Verification',
  approval_pending: 'Pending Approval',
  completed: 'Process Completed',
  eligibility_check: 'Checking Eligibility',
  loan_details: 'Reviewing Loan Details',
  document_submission: 'Submitting Documents',
};

export default function FSMTracker({
  processType,
  currentState,
  allSteps = [],
  completedSteps = [],
  availableTransitions = [],
  onAdvance,
}) {
  if (!processType) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          📋 Process Tracker
        </h3>
        <p className="text-sm text-gray-500">No process started yet.</p>
      </div>
    );
  }

  const processLabel =
    processType === 'account_opening'
      ? '🏦 Account Opening'
      : '💰 Loan Inquiry';

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
        📋 Process Tracker
      </h3>
      <p className="text-xs text-indigo-400 mb-4">{processLabel}</p>

      {/* Step timeline */}
      <div className="relative">
        {allSteps.map((step, idx) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentState;
          const isUpcoming = !isCompleted && !isCurrent;

          return (
            <div key={step} className="flex items-start gap-3 mb-4 last:mb-0">
              {/* Connector line + dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-400 text-white'
                      : isCurrent
                      ? 'bg-indigo-500 border-indigo-400 text-white animate-pulse-soft'
                      : 'bg-white/5 border-white/20 text-gray-500'
                  }`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                {idx < allSteps.length - 1 && (
                  <div
                    className={`w-0.5 h-6 mt-1 ${
                      isCompleted ? 'bg-emerald-500/50' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>

              {/* Step label */}
              <div className="flex-1 pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    isCompleted
                      ? 'text-emerald-400'
                      : isCurrent
                      ? 'text-white'
                      : 'text-gray-500'
                  }`}
                >
                  {STATE_LABELS[step] || step}
                </p>
                {isCurrent && (
                  <p className="text-[10px] text-indigo-400 mt-0.5">
                    ● Current Step
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advance button */}
      {availableTransitions.length > 0 && (
        <button
          onClick={() => onAdvance?.(availableTransitions[0])}
          className="btn-primary w-full mt-4 text-sm"
        >
          Advance to: {STATE_LABELS[availableTransitions[0]] || availableTransitions[0]}
        </button>
      )}

      {currentState === 'completed' && (
        <div className="mt-4 text-center">
          <span className="badge-success text-sm px-4 py-1.5">
            ✅ Process Completed
          </span>
        </div>
      )}
    </div>
  );
}
