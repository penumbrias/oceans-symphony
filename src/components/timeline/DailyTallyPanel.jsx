import React, { useMemo } from "react";
import { parseDate } from "@/lib/dateUtils";
import { startOfDay, endOfDay } from "date-fns";

const EMOTION_COLORS = [
  "#f43f5e","#ec4899","#a855f7","#3b82f6","#14b8a6",
  "#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#84cc16","#e11d48","#7c3aed","#0891b2",
];

function emotionColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EMOTION_COLORS[h % EMOTION_COLORS.length];
}

export default function DailyTallyPanel({ day, sessions, activities, emotions, journals, alters }) {
  const dayStart = useMemo(() => startOfDay(day), [day]);
  const dayEnd = useMemo(() => endOfDay(day), [day]);

  // Emotion tally
  const emotionTally = useMemo(() => {
    const tally = {};
    emotions.forEach((e) => {
      const t = parseDate(e.timestamp);
      if (t >= dayStart && t <= dayEnd) {
        (e.emotions || []).forEach((em) => {
          tally[em] = (tally[em] || 0) + 1;
        });
      }
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [emotions, dayStart, dayEnd]);

  // Fronter tally with total time
  const fronterTally = useMemo(() => {
    const tally = {};
    sessions.forEach((s) => {
      const start = parseDate(s.start_time);
      const end = s.end_time ? parseDate(s.end_time) : new Date();
      
      const sessionStart = Math.max(start, dayStart);
      const sessionEnd = Math.min(end, dayEnd);
      
      if (sessionStart < sessionEnd) {
        const mins = Math.round((sessionEnd - sessionStart) / 60000);
        const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
        ids.forEach((id) => {
          if (!tally[id]) tally[id] = 0;
          tally[id] += mins;
        });
      }
    });
    
    return Object.entries(tally)
      .map(([alterId, mins]) => ({
        alterId,
        mins,
        alter: alters.find((a) => a.id === alterId),
      }))
      .sort((a, b) => b.mins - a.mins);
  }, [sessions, dayStart, dayEnd, alters]);

  // Total switch count
  const switchCount = useMemo(() => {
    return sessions.filter((s) => {
      const start = parseDate(s.start_time);
      return start >= dayStart && start <= dayEnd;
    }).length;
  }, [sessions, dayStart, dayEnd]);

  // Activity count
  const activityCount = useMemo(() => {
    return activities.filter((a) => {
      const t = parseDate(a.timestamp);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [activities, dayStart, dayEnd]);

  // Journal count
  const journalCount = useMemo(() => {
    return journals.filter((j) => {
      const t = parseDate(j.created_date);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [journals, dayStart, dayEnd]);

  const avgSwitchTime = useMemo(() => {
    if (switchCount === 0) return 0;
    const totalMins = fronterTally.reduce((sum, f) => sum + f.mins, 0);
    return Math.round(totalMins / switchCount);
  }, [switchCount, fronterTally]);

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground font-medium mb-1">Emotions</p>
          <div className="flex flex-wrap gap-1">
            {emotionTally.length > 0 ? (
              emotionTally.slice(0, 5).map(([em, count]) => (
                <div key={em} className="px-1.5 py-0.5 rounded text-white font-medium text-xs flex items-center gap-1"
                  style={{ backgroundColor: emotionColor(em) }}>
                  {em} <span className="opacity-80">×{count}</span>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">Fronters</p>
          <div className="space-y-0.5">
            {fronterTally.length > 0 ? (
              fronterTally.slice(0, 3).map(({ alter, mins }) => (
                <div key={alter?.id} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: alter?.color || "#9333ea" }} />
                  <span className="truncate">{alter?.name || "Unknown"}</span>
                  <span className="text-muted-foreground">{Math.round(mins / 60)}h</span>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">Switches</p>
          <p className="text-base font-semibold">{switchCount}</p>
          {switchCount > 0 && (
            <p className="text-muted-foreground text-xs">avg {avgSwitchTime}m each</p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground font-medium">Activity</p>
          <div className="flex gap-3">
            <div>
              <p className="font-semibold text-base">{activityCount}</p>
              <p className="text-muted-foreground text-xs">activities</p>
            </div>
            <div>
              <p className="font-semibold text-base">{journalCount}</p>
              <p className="text-muted-foreground text-xs">journals</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}