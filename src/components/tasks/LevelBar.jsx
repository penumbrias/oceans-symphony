import React from "react";
import { getLevelFromTotalXP } from "@/lib/dailyTaskSystem";

export default function LevelBar({
  totalXP,
  periodXP,
  periodPossibleXP,
  periodLabel = "today",
  // Legacy props — still accepted so older callers keep working.
  todayXP,
  todayPossibleXP,
  streak,
  bestStreak,
}) {
  const { level, xpIntoLevel, xpForNextLevel } = getLevelFromTotalXP(totalXP);
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));
  // Resolve effective numbers, preferring the new period-aware props.
  const earned = periodXP !== undefined ? periodXP : todayXP;
  const possible = periodPossibleXP !== undefined ? periodPossibleXP : todayPossibleXP;
  const showChip = earned !== undefined && possible !== undefined;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">Level {level}</span>
          {showChip && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {earned}/{possible} pts {periodLabel}
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground font-medium">{totalXP} total XP</span>
      </div>

      {/* Progress bar with gradient */}
      <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{xpForNextLevel - xpIntoLevel} XP to next level</span>
        <span>🔥 {streak} day streak · Best {bestStreak}</span>
      </div>
    </div>
  );
}