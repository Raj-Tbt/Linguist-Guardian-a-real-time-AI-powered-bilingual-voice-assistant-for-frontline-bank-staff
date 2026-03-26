/**
 * SentimentMeter — Real-time customer stress indicator.
 *
 * Displays a visual gauge showing the customer's current stress
 * level (0.0–1.0) based on MFCC + YIN analysis from the backend.
 *
 * Color gradient:
 *   🟢 Green  (0.0–0.35) — Calm
 *   🟡 Yellow (0.35–0.65) — Moderate
 *   🔴 Red    (0.65–1.0) — Stressed (de-escalation triggered)
 */

export default function SentimentMeter({ stressScore = 0, deEscalate = false }) {
  const percentage = Math.round(stressScore * 100);

  // Determine color and label
  let color, bgGradient, label;
  if (stressScore < 0.35) {
    color = 'text-emerald-400';
    bgGradient = 'from-emerald-500/30 to-emerald-500/10';
    label = 'Calm';
  } else if (stressScore < 0.65) {
    color = 'text-amber-400';
    bgGradient = 'from-amber-500/30 to-amber-500/10';
    label = 'Moderate';
  } else {
    color = 'text-red-400';
    bgGradient = 'from-red-500/30 to-red-500/10';
    label = 'Stressed';
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          😊 Customer Stress
        </h3>
        <span className={`text-xs font-medium ${color}`}>
          {label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden mb-2">
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${bgGradient} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
        {/* Threshold marker at 65% */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400/50"
          style={{ left: '65%' }}
          title="De-escalation threshold"
        />
      </div>

      {/* Score display */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>0.0</span>
        <span className={`font-mono font-bold ${color}`}>
          {stressScore.toFixed(2)}
        </span>
        <span>1.0</span>
      </div>

      {/* De-escalation alert */}
      {deEscalate && (
        <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <span className="text-red-400 animate-pulse-soft">⚠️</span>
          <span className="text-xs text-red-300">
            De-escalation active — calm voice profile enabled
          </span>
        </div>
      )}
    </div>
  );
}
