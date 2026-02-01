"use client";

import { DIFFICULTY_RANKS, getDifficultyRank } from "@/lib/content";

interface DifficultyMeterProps {
  currentLevel: number;
  totalLevels?: number;
}

export function DifficultyMeter({ currentLevel, totalLevels = 10 }: DifficultyMeterProps) {
  const rank = getDifficultyRank(currentLevel);
  
  // Color based on difficulty
  const getColorClass = (level: number) => {
    if (level <= 3) return "bg-green-400";
    if (level <= 6) return "bg-yellow-400";
    if (level <= 8) return "bg-orange-400";
    return "bg-red-500";
  };
  
  const getBgColor = (level: number, isCurrent: boolean) => {
    if (!isCurrent) return "bg-gray-200";
    return getColorClass(level);
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-paper-line shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-ink-muted">Ops Rank</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          currentLevel <= 3 
            ? "bg-green-100 text-green-800" 
            : currentLevel <= 6 
            ? "bg-yellow-100 text-yellow-800"
            : currentLevel <= 8
            ? "bg-orange-100 text-orange-800"
            : "bg-red-100 text-red-800"
        }`}>
          Level {currentLevel} / {totalLevels}
        </span>
      </div>
      
      {/* Level meter */}
      <div className="flex gap-0.5 mb-2">
        {Array.from({ length: totalLevels }, (_, i) => i + 1).map((level) => (
          <div
            key={level}
            className={`flex-1 h-2 rounded-sm transition-all duration-300 ${
              level <= currentLevel ? getBgColor(level, true) : getBgColor(level, false)
            } ${level === currentLevel ? "ring-2 ring-offset-1 ring-ink/30" : ""}`}
          />
        ))}
      </div>
      
      {/* Rank title */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-lg">
          {currentLevel <= 3 ? "🌱" : currentLevel <= 6 ? "⚡" : currentLevel <= 8 ? "🔥" : "👑"}
        </span>
        <span className={`font-bold text-sm ${
          currentLevel <= 3 
            ? "text-green-700" 
            : currentLevel <= 6 
            ? "text-yellow-700"
            : currentLevel <= 8
            ? "text-orange-700"
            : "text-red-700"
        }`}>
          {rank}
        </span>
      </div>
    </div>
  );
}
