interface ProgressStatsProps {
  accuracy: number | null;
  reviewErrorCount: number;
  misconceptionErrorCount: number;
  topMisconceptions: { id: string; name: string; count: number }[];
  topReviewErrors: { type: string; name: string; count: number }[];
}

export function ProgressStats({ 
  accuracy, 
  reviewErrorCount,
  misconceptionErrorCount,
  topMisconceptions,
  topReviewErrors,
}: ProgressStatsProps) {
  const totalErrors = reviewErrorCount + misconceptionErrorCount;
  
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

      {/* Error breakdown - separate bars */}
      {totalErrors > 0 && (
        <div className="mb-5 space-y-3">
          <span className="text-sm text-ink-muted block">Mistakes (last 10)</span>
          
          {/* Misconception errors bar */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-highlighter-pink" />
                <span className="text-sm text-ink">Misconception errors</span>
              </div>
              <span className="text-sm font-medium text-ink">{misconceptionErrorCount}</span>
            </div>
            <div className="h-2 bg-paper-line rounded-full overflow-hidden">
              <div 
                className="h-full bg-highlighter-pink rounded-full transition-all duration-500"
                style={{ width: totalErrors > 0 ? `${(misconceptionErrorCount / 10) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Review errors bar */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-sm text-ink">Review errors</span>
              </div>
              <span className="text-sm font-medium text-ink">{reviewErrorCount}</span>
            </div>
            <div className="h-2 bg-paper-line rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: totalErrors > 0 ? `${(reviewErrorCount / 10) * 100}%` : "0%" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Top review errors */}
      {topReviewErrors.length > 0 && (
        <div className="mb-5">
          <span className="text-sm text-ink-muted block mb-2">Top review errors this week</span>
          <ul className="space-y-2">
            {topReviewErrors.slice(0, 3).map((p, i) => (
              <li key={p.type} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-medium">
                  {i + 1}
                </span>
                <span className="text-ink truncate capitalize">
                  {p.name}
                </span>
                <span className="text-ink-muted ml-auto">×{p.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Top misconceptions */}
      <div className="mb-4">
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
      
      {/* Mastery explanation note */}
      <div className="pt-3 border-t border-paper-line">
        <p className="text-xs text-ink-muted italic leading-relaxed">
          💡 Topic mastery is based on coverage across subskills + accuracy. 
          Practice all types of problems to reach 100%!
        </p>
      </div>
    </div>
  );
}
