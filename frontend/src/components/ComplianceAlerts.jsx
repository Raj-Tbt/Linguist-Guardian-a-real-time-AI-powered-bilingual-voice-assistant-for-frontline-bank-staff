/**
 * ComplianceAlerts — Banking-grade compliance warning display.
 *
 * Features:
 *   • Risk-based severity colors: 🔴 High / 🟡 Medium / 🟢 Low
 *   • Card-format alerts with clean banking aesthetic
 *   • Category labels, matched phrase, timestamps
 */

const RISK_STYLES = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700 border border-red-200',
    icon: '🔴',
    label: 'High Risk',
    headerLabel: '🚨 Critical',
  },
  medium: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
    icon: '🟡',
    label: 'Medium Risk',
    headerLabel: '⚠️ Warning',
  },
  low: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    icon: '🟢',
    label: 'Low Risk',
    headerLabel: '💡 Caution',
  },
};

const SEVERITY_BADGE = {
  critical: 'badge-danger',
  warning: 'badge-warning',
  info: 'badge-success',
};

export default function ComplianceAlerts({ alerts = [] }) {
  if (alerts.length === 0) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Compliance Monitor
        </h3>
        <div className="flex items-center gap-2 text-emerald-600 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft" />
          All clear — no violations detected
        </div>
      </div>
    );
  }

  const riskCounts = { high: 0, medium: 0, low: 0 };
  alerts.forEach((a) => {
    const risk = a.risk || 'medium';
    riskCounts[risk] = (riskCounts[risk] || 0) + 1;
  });

  return (
    <div className="glass-card p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Compliance Monitor
        <span className="badge-danger">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
      </h3>

      {/* Risk summary */}
      <div className="flex items-center gap-3 mb-3 text-[11px]">
        {riskCounts.high > 0 && (
          <span className="flex items-center gap-1 text-red-700 font-medium">🔴 {riskCounts.high} High</span>
        )}
        {riskCounts.medium > 0 && (
          <span className="flex items-center gap-1 text-amber-700 font-medium">🟡 {riskCounts.medium} Medium</span>
        )}
        {riskCounts.low > 0 && (
          <span className="flex items-center gap-1 text-emerald-700 font-medium">🟢 {riskCounts.low} Low</span>
        )}
      </div>

      {/* Alert cards */}
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
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={severityClass}>{style.headerLabel}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${style.badge}`}>
                  {style.icon} {style.label}
                </span>
                {alert.category && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-gray-100 text-gray-500 border border-gray-200">
                    {alert.category}
                  </span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">{timestamp}</span>
              </div>

              <p className="text-sm text-gray-700 leading-snug">{alert.description}</p>

              {alert.matched_text && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Trigger:</span>
                  <code className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
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
