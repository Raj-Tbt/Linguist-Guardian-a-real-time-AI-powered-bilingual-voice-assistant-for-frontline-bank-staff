/**
 * SentimentMeter — Customer stress indicator with banking aesthetic.
 *
 * Color gradient:
 *   🟢 Green  (0.0–0.35) — Calm
 *   🟡 Yellow (0.35–0.65) — Moderate
 *   🔴 Red    (0.65–1.0) — Stressed
 */

export default function SentimentMeter({ stressScore = 0, deEscalate = false }) {
  const percentage = Math.round(stressScore * 100);

  let color, bgGradient, barColor, label;
  if (stressScore < 0.35) {
    color = 'text-emerald-600';
    bgGradient = 'from-emerald-200 to-emerald-100';
    barColor = 'bg-emerald-500';
    label = 'Calm';
  } else if (stressScore < 0.65) {
    color = 'text-amber-600';
    bgGradient = 'from-amber-200 to-amber-100';
    barColor = 'bg-amber-500';
    label = 'Moderate';
  } else {
    color = 'text-red-600';
    bgGradient = 'from-red-200 to-red-100';
    barColor = 'bg-red-500';
    label = 'Stressed';
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Customer Stress
        </h3>
        <span className={`text-xs font-semibold ${color}`}>
          {label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400/60"
          style={{ left: '65%' }}
          title="De-escalation threshold"
        />
      </div>

      {/* Score */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>0.0</span>
        <span className={`font-mono font-bold ${color}`}>
          {stressScore.toFixed(2)}
        </span>
        <span>1.0</span>
      </div>

      {/* De-escalation alert */}
      {deEscalate && (
        <div className="mt-3 p-2 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
          <span className="text-red-600 animate-pulse-soft">⚠️</span>
          <span className="text-xs text-red-700 font-medium">
            De-escalation active — calm voice profile enabled
          </span>
        </div>
      )}
    </div>
  );
}
