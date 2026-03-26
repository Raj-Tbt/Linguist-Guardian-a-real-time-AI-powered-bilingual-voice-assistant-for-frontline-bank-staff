/**
 * ComplianceAlerts — Enhanced real-time compliance warning display.
 *
 * Features:
 *   • Risk-based severity colors: 🔴 High / 🟡 Medium / 🟢 Low
 *   • Category labels (KYC Violations, Mis-selling, etc.)
 *   • Matched phrase highlight
 *   • Timestamps on each alert
 *   • Context-aware — only shows valid alerts (negated phrases are filtered server-side)
 */

const RISK_STYLES = {
  high: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
    icon: '🔴',
    label: 'High Risk',
    headerLabel: '🚨 Critical',
  },
  medium: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
    icon: '🟡',
    label: 'Medium Risk',
    headerLabel: '⚠️ Warning',
  },
  low: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    icon: '🟢',
    label: 'Low Risk',
    headerLabel: '💡 Caution',
  },
};

const SEVERITY_BADGE = {
  critical: 'badge-danger',
  warning: 'badge-warning',
  info: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium',
};

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

  // Count by risk level
  const riskCounts = { high: 0, medium: 0, low: 0 };
  alerts.forEach((a) => {
    const risk = a.risk || 'medium';
    riskCounts[risk] = (riskCounts[risk] || 0) + 1;
  });

  return (
    <div className="glass-card p-4">
      {/* Header with alert count + risk summary */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        🛡️ Compliance Monitor
        <span className="badge-danger">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </h3>

      {/* Risk summary bar */}
      <div className="flex items-center gap-3 mb-3 text-[10px]">
        {riskCounts.high > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            🔴 {riskCounts.high} High
          </span>
        )}
        {riskCounts.medium > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            🟡 {riskCounts.medium} Medium
          </span>
        )}
        {riskCounts.low > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            🟢 {riskCounts.low} Low
          </span>
        )}
      </div>

      {/* Alert list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {alerts.map((alert, idx) => {
          const risk = alert.risk || 'medium';
          const style = RISK_STYLES[risk] || RISK_STYLES.medium;
          const severityClass = SEVERITY_BADGE[alert.severity] || SEVERITY_BADGE.warning;
          const timestamp = alert.timestamp
            ? new Date(alert.timestamp).toLocaleTimeString()
            : new Date().toLocaleTimeString();

          return (
            <div
              key={alert.id || idx}
              className={`animate-slide-up rounded-lg p-3 border ${style.bg} ${style.border}`}
            >
              {/* Row 1: Severity + Risk + Category + Time */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={severityClass}>
                  {style.headerLabel}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                  {style.icon} {style.label}
                </span>
                {alert.category && (
                  <span className="badge bg-white/5 text-gray-400 border border-white/10 text-[10px]">
                    {alert.category}
                  </span>
                )}
                <span className="text-[10px] text-gray-600 ml-auto">
                  {timestamp}
                </span>
              </div>

              {/* Row 2: Description */}
              <p className="text-sm text-gray-300 leading-snug">
                {alert.description}
              </p>

              {/* Row 3: Matched phrase */}
              {alert.matched_text && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500">Trigger:</span>
                  <code className="text-[11px] bg-white/5 text-gray-300 px-1.5 py-0.5 rounded border border-white/10">
                    "{alert.matched_text}"
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
