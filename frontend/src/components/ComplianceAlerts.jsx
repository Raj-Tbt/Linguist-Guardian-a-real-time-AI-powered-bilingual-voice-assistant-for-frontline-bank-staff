/**
 * ComplianceAlerts — Real-time compliance warning display.
 *
 * Renders a panel of compliance violations with:
 *   • Alert type (keyword / semantic)
 *   • Severity badges (warning / critical)
 *   • Matched text highlight
 *   • Confidence score
 */

export default function ComplianceAlerts({ alerts = [] }) {
  if (alerts.length === 0) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          🛡️ Compliance Monitor
        </h3>
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-soft" />
          All clear — no violations detected
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        🛡️ Compliance Monitor
        <span className="badge-danger">{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
      </h3>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {alerts.map((alert, idx) => (
          <div
            key={alert.id || idx}
            className={`animate-slide-up rounded-lg p-3 border ${
              alert.severity === 'critical'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className={
                  alert.severity === 'critical' ? 'badge-danger' : 'badge-warning'
                }
              >
                {alert.severity === 'critical' ? '🚨 Critical' : '⚠️ Warning'}
              </span>
              <span className="badge bg-white/5 text-gray-400 border border-white/10">
                {alert.alert_type}
              </span>
              {alert.confidence && (
                <span className="text-[10px] text-gray-500 ml-auto">
                  {Math.round(alert.confidence * 100)}% confidence
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-sm text-gray-300">{alert.description}</p>

            {/* Matched text */}
            {alert.matched_text && (
              <p className="text-xs text-gray-500 mt-1 italic">
                Match: "{alert.matched_text}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
