interface ProgressStatsProps {
  accuracy: number | null;
  topMisconceptions: { id: string; name: string; count: number }[];
}

export function ProgressStats({ accuracy, topMisconceptions }: ProgressStatsProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 shadow-sm border border-paper-lineDark">
      <h3 className="font-semibold text-ink mb-4">Your Progress</h3>
      
      {/* Accuracy over last 10 */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-ink-muted">Accuracy (last 10 questions)</span>
          <span className="font-medium text-ink">
            {accuracy !== null ? `${accuracy}%` : "—"}
          </span>
        </div>
        <div className="h-2.5 bg-paper-line rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              accuracy === null ? "w-0" :
              accuracy >= 70 ? "bg-highlighter-green" : 
              accuracy >= 40 ? "bg-highlighter-yellow" : 
              "bg-highlighter-pink"
            }`}
            style={{ width: accuracy !== null ? `${accuracy}%` : "0%" }}
          />
        </div>
      </div>
      
      {/* Top misconceptions */}
      <div>
        <span className="text-sm text-ink-muted block mb-2">Top misconceptions this week</span>
        {topMisconceptions.length > 0 ? (
          <ul className="space-y-2">
            {topMisconceptions.slice(0, 3).map((m, i) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-highlighter-pink/50 text-pink-700 flex items-center justify-center text-xs font-medium">
                  {i + 1}
                </span>
                <span className="text-ink truncate">{m.name}</span>
                <span className="text-ink-muted ml-auto">×{m.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted italic">No misconceptions tracked yet</p>
        )}
      </div>
    </div>
  );
}
