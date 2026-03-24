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

export default function DailyTallyPanel({ day, sessions, activities, emotions, journals, alters, checkIns = [], tasks = [], dailyTasksTotal = 0, dailyTasksCompleted = 0 }) {
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

  // Check-in count
  const checkInCount = useMemo(() => {
    return checkIns.filter((c) => {
      const t = parseDate(c.created_date);
      return t >= dayStart && t <= dayEnd;
    }).length;
  }, [checkIns, dayStart, dayEnd]);

  // Tasks: created and completed on this day
  const taskStats = useMemo(() => {
    const dayTasks = tasks.filter((t) => {
      const created = parseDate(t.created_date);
      const completed = t.completed && t.completed_date ? parseDate(t.completed_date) : null;
      return (created >= dayStart && created <= dayEnd) || (completed && completed >= dayStart && completed <= dayEnd);
    });
    const completedCount = dayTasks.filter((t) => t.completed && parseDate(t.completed_date) >= dayStart && parseDate(t.completed_date) <= dayEnd).length;
    const createdCount = dayTasks.filter((t) => parseDate(t.created_date) >= dayStart && parseDate(t.created_date) <= dayEnd).length;
    const completionPercent = createdCount > 0 ? Math.round((completedCount / createdCount) * 100) : 0;
    return { created: createdCount, completed: completedCount, percent: completionPercent };
  }, [tasks, dayStart, dayEnd]);

  // Unique activities
  const uniqueActivities = useMemo(() => {
    const dayActs = activities.filter((a) => {
      const t = parseDate(a.timestamp);
      return t >= dayStart && t <= dayEnd;
    });
    const names = [...new Set(dayActs.map((a) => a.activity_name))];
    return names;
  }, [activities, dayStart, dayEnd]);

  const avgSwitchTime = useMemo(() => {
    if (switchCount === 0) return 0;
    const totalMins = fronterTally.reduce((sum, f) => sum + f.mins, 0);
    return Math.round(totalMins / switchCount);
  }, [switchCount, fronterTally]);

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground font-medium mb-1">Activities</p>
          <div className="flex flex-wrap gap-1">
            {uniqueActivities.length > 0 ? (
              uniqueActivities.slice(0, 6).map((name) => (
                <div key={name} className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium text-xs">
                  {name}
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
            {uniqueActivities.length > 6 && (
              <span className="text-muted-foreground text-xs">+{uniqueActivities.length - 6} more</span>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center justify-start">
            <p className="text-muted-foreground font-medium text-xs mb-1">Switches</p>
            <p className="text-2xl font-bold text-primary">{switchCount}</p>
          </div>
          <div className="flex-1">
            <p className="text-muted-foreground font-medium mb-1">Fronters</p>
            <div className="space-y-0.5">
              {fronterTally.length > 0 ? (
                fronterTally.map(({ alter, mins }) => (
                  <div key={alter?.id} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: alter?.color || "#9333ea" }} />
                    <span className="truncate text-xs">{alter?.name || "Unknown"}</span>
                    <span className="text-muted-foreground text-xs">{Math.round(mins / 60)}h</span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground italic">None</span>
              )}
            </div>
          </div>
        </div>

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
          <p className="text-muted-foreground font-medium mb-1">Check-ins</p>
          <p className="font-semibold text-base">{checkInCount}</p>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">Daily Tasks</p>
          <p className="font-semibold text-base">{dailyTasksCompleted}/{dailyTasksTotal}</p>
        </div>

        <div>
          <p className="text-muted-foreground font-medium mb-1">Tasks</p>
          <div className="flex gap-3">
            <div>
              <p className="font-semibold text-base">{taskStats.completed}/{taskStats.created}</p>
              <p className="text-muted-foreground text-xs">{taskStats.percent}% done</p>
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